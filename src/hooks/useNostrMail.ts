import { useCallback } from 'react';
// import { useNostrLogin } from '@nostrify/react/login';
// import { nip19 } from 'nostr-tools';
import { DEFAULT_NOTIFICATION_EMAIL, DISTRICT_EMAIL_MAP } from '@/lib/constants';

// --- nostr-mail (uid.ovh bridge) ---
// import { wrapEvent } from 'nostr-tools/nip59';
// import { SimplePool } from 'nostr-tools/pool';
// import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
// const BRIDGE_PUBKEY = '0d365385f474d4b025377b4ade6ad241f847d514a9e9b475069f69a20f886c68';
// const BRIDGE_RELAYS = ['wss://nostr-01.uid.ovh', 'wss://nostr-02.uid.ovh', 'wss://relay.damus.io', 'wss://relay.primal.net'];

// --- Lambda email (Resend) ---
const LAMBDA_URL = import.meta.env.VITE_LAMBDA_URL as string | undefined;

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

export function useNostrMail() {
  // const { logins } = useNostrLogin();
  // Uncomment when re-enabling nostr-mail bridge

  const sendReportNotification = useCallback(async (report: ReportNotification) => {
    // --- Lambda email (Resend) ---
    if (LAMBDA_URL) {
      const to = DISTRICT_EMAIL_MAP[report.district ?? ''] ?? DEFAULT_NOTIFICATION_EMAIL;
      const subject = `[FtheRoads] ${report.severity.toUpperCase()}: ${report.title}`;
      const text = [
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

      console.log('[email] Sending to:', to, 'subject:', subject);

      const response = await fetch(LAMBDA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, text }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[email] Failed:', response.status, error);
        throw new Error(`Email failed: ${response.status} ${error}`);
      }

      const result = await response.json();
      console.log('[email] Sent:', result);
      return result;
    }

    // --- nostr-mail (uid.ovh bridge) ---
    // Fallback if VITE_LAMBDA_URL is not set
    // Uncomment below and remove the throw to re-enable nostr-mail bridge:
    throw new Error('No email method configured. Set VITE_LAMBDA_URL or uncomment nostr-mail code.');

    // const NOTIFICATION_EMAIL = DEFAULT_NOTIFICATION_EMAIL;
    // const nsecLogin = logins.find(l => l.type === 'nsec');
    // if (!nsecLogin || nsecLogin.type !== 'nsec') {
    //   throw new Error('Email notification requires nsec login');
    // }
    // const decoded = nip19.decode(nsecLogin.data.nsec);
    // const secretKey = decoded.data as Uint8Array;
    // const pubkey = await import('nostr-tools/pure').then(m => m.getPublicKey(secretKey));
    // const npub = nip19.npubEncode(pubkey);

    // Uncomment below to re-enable nostr-mail bridge:
    // const fromAddress = `${npub}@uid.ovh`;
    // const subject = `[FtheRoads] ${report.severity.toUpperCase()}: ${report.title}`;
    // const body = [
    //   'New road hazard report submitted on FtheRoads.com',
    //   '',
    //   `Title: ${report.title}`,
    //   `Type: ${report.type}`,
    //   `Severity: ${report.severity}`,
    //   `Location: ${report.location || 'N/A'}`,
    //   `Coordinates: ${report.lat}, ${report.lng}`,
    //   report.district ? `District: ${report.district}` : '',
    //   `Reporter: ${report.reporterNpub}`,
    //   '',
    //   'Description:',
    //   report.description || 'No description provided.',
    //   '',
    //   `View on map: https://ftheroads.com/?lat=${report.lat}&lng=${report.lng}`,
    // ].filter(Boolean).join('\n');
    //
    // const mime = [
    //   `From: ${fromAddress}`,
    //   `To: ${NOTIFICATION_EMAIL}`,
    //   `Subject: =?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
    //   'Content-Type: text/plain; charset=utf-8',
    //   `Date: ${new Date().toUTCString()}`,
    //   'MIME-Version: 1.0',
    //   '',
    //   body,
    // ].join('\r\n');
    //
    // const emailEvent = {
    //   kind: 1301,
    //   created_at: Math.floor(Date.now() / 1000),
    //   tags: [
    //     ['p', BRIDGE_PUBKEY],
    //     ['subject', subject],
    //     ['from', fromAddress],
    //     ['to', NOTIFICATION_EMAIL],
    //     ['date', Math.floor(Date.now() / 1000).toString()],
    //     ['mail-from', fromAddress],
    //     ['rcpt-to', NOTIFICATION_EMAIL],
    //   ],
    //   content: mime,
    // };
    //
    // const wrappedEvent = wrapEvent(emailEvent, secretKey, BRIDGE_PUBKEY);
    // const pool = new SimplePool({ enablePing: true, enableReconnect: true });
    // const authParams = { onauth: async (authEvent: any) => finalizeEvent(authEvent, secretKey) };
    // const results = await Promise.allSettled(pool.publish(BRIDGE_RELAYS, wrappedEvent, authParams));
    // const ok = results.filter(r => r.status === 'fulfilled').length;
    // if (ok === 0) throw new Error('Email failed to publish to any relay');
    // console.log(`[nostr-mail] Published to ${ok}/${BRIDGE_RELAYS.length} relays`);
  }, []);

  return { sendReportNotification };
}
