import { useCallback } from 'react';
import { useNostrLogin } from '@nostrify/react/login';
import { nip19 } from 'nostr-tools';
import { wrapEvent } from 'nostr-tools/nip59';
import { SimplePool } from 'nostr-tools/pool';
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';

// uid.ovh bridge pubkey (resolved from _smtp@uid.ovh via NIP-05)
const BRIDGE_PUBKEY = '0d365385f474d4b025377b4ade6ad241f847d514a9e9b475069f69a20f886c68';
const NOTIFICATION_EMAIL = 'croix4clerk@pm.me';

const RELAYS = [
  'wss://nostr-01.uid.ovh',
  'wss://nostr-02.uid.ovh',
  'wss://relay.damus.io',
  'wss://relay.primal.net',
];

interface ReportNotification {
  title: string;
  type: string;
  severity: string;
  description: string;
  location: string;
  lat: number;
  lng: number;
  district?: string;
  reporterNpub: string;
}

function buildMime(from: string, to: string, subject: string, text: string): string {
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
    'Content-Type: text/plain; charset=utf-8',
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    '',
    text,
  ].join('\r\n');
}

export function useNostrMail() {
  const { logins } = useNostrLogin();

  const sendReportNotification = useCallback(async (report: ReportNotification) => {
    const nsecLogin = logins.find(l => l.type === 'nsec');
    if (!nsecLogin || nsecLogin.type !== 'nsec') {
      throw new Error('Email notification requires nsec login');
    }

    const decoded = nip19.decode(nsecLogin.data.nsec);
    const secretKey = decoded.data as Uint8Array;
    const pubkey = getPublicKey(secretKey);
    const npub = nip19.npubEncode(pubkey);

    // Use @uid.ovh domain — the bridge requires this to accept the email
    const fromAddress = `${npub}@uid.ovh`;

    const subject = `[FtheRoads] ${report.severity.toUpperCase()}: ${report.title}`;
    const body = [
      'New road hazard report submitted on FtheRoads.com',
      '',
      `Title: ${report.title}`,
      `Type: ${report.type}`,
      `Severity: ${report.severity}`,
      `Location: ${report.location || 'N/A'}`,
      `Coordinates: ${report.lat}, ${report.lng}`,
      report.district ? `District: ${report.district}` : '',
      `Reporter: ${report.reporterNpub}`,
      '',
      'Description:',
      report.description || 'No description provided.',
      '',
      `View on map: https://ftheroads.com/?lat=${report.lat}&lng=${report.lng}`,
    ].filter(Boolean).join('\n');

    const mime = buildMime(fromAddress, NOTIFICATION_EMAIL, subject, body);

    // Build the kind 1301 email rumor
    const emailEvent = {
      kind: 1301,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['p', BRIDGE_PUBKEY],
        ['subject', subject],
        ['from', fromAddress],
        ['to', NOTIFICATION_EMAIL],
        ['date', Math.floor(Date.now() / 1000).toString()],
        // Bridge-specific tags for SMTP routing
        ['mail-from', fromAddress],
        ['rcpt-to', NOTIFICATION_EMAIL],
      ],
      content: mime,
    };

    console.group('[nostr-mail] Sending email notification');
    console.log('From:', fromAddress);
    console.log('To:', NOTIFICATION_EMAIL);
    console.log('Bridge pubkey:', BRIDGE_PUBKEY);
    console.log('Event kind 1301 tags:', emailEvent.tags);

    // Gift-wrap the event (NIP-59: rumor → seal → kind 1059 wrap)
    const wrappedEvent = wrapEvent(emailEvent, secretKey, BRIDGE_PUBKEY);
    console.log('[nostr-mail] Wrapped → kind:', wrappedEvent.kind, 'id:', wrappedEvent.id?.substring(0, 12));

    // Publish to relays
    const pool = new SimplePool({ enablePing: true, enableReconnect: true });
    const authParams = {
      onauth: async (authEvent: any) => finalizeEvent(authEvent, secretKey),
    };

    console.log('[nostr-mail] Publishing to', RELAYS.length, 'relays...');
    const publishPromises = pool.publish(RELAYS, wrappedEvent, authParams);
    const results = await Promise.allSettled(publishPromises);

    const ok = results.filter(r => r.status === 'fulfilled').length;
    const failed = results
      .map((r, i) => ({ relay: RELAYS[i], result: r }))
      .filter(r => r.result.status === 'rejected');

    console.log(`[nostr-mail] Results: ${ok}/${RELAYS.length} succeeded`);
    if (failed.length > 0) {
      failed.forEach(f => {
        const reason = f.result.status === 'rejected' ? f.result.reason : '';
        console.warn(`[nostr-mail] ✗ ${f.relay}:`, reason?.message || reason);
      });
    }

    console.groupEnd();

    if (ok === 0) {
      throw new Error(`Email failed to publish to any relay (${failed.length} failures)`);
    }
  }, [logins]);

  return { sendReportNotification };
}
