import { useCallback } from 'react';
import { useNostr } from '@nostrify/react';
import { useNostrLogin } from '@nostrify/react/login';
import { nip19 } from 'nostr-tools';
import { getPublicKey, finalizeEvent } from 'nostr-tools/pure';
import { SimplePool } from 'nostr-tools/pool';
import { normalizeURL } from 'nostr-tools/utils';
import { wrapEvent } from 'nostr-tools/nip59';
import { createMimeMessage } from 'mimetext/browser';
import { DEFAULT_NOTIFICATION_EMAIL, getDistrictEmail, ADMIN_NPUB, ADMIN_EMAIL } from '@/lib/constants';

// --- uid.ovh nostr-mail bridge (confirmed via NIP-05 at uid.ovh) ---
const BRIDGE_PUBKEY = '0d365385f474d4b025377b4ade6ad241f847d514a9e9b475069f69a20f886c68';

// --- Admin pubkey (hex) for error DMs and BCC ---
const ADMIN_PUBKEY = nip19.decode(ADMIN_NPUB).data as string;

// --- Relay constants (from nostr-mail SDK) ---
const BOOTSTRAP_RELAYS = [
  'wss://purplepag.es',
  'wss://relay.damus.io',
  'wss://nos.lol',
];

const DEFAULT_DM_RELAYS = [
  'wss://auth.nostr1.com',
  'wss://nostr-01.uid.ovh',
  'wss://nostr-02.uid.ovh',
];

const DEFAULT_RELAYS = [
  'wss://relay.camelus.app',
  'wss://nostr-01.yakihonne.com',
  'wss://relay.damus.io',
  'wss://nostr-01.uid.ovh',
  'wss://nostr-02.uid.ovh',
  'wss://relay.primal.net',
];

// --- Lambda email (Resend) ---
const LAMBDA_URL = import.meta.env.VITE_LAMBDA_URL as string | undefined;

// --- Mail mode configuration ---
// "nostr"  = send via nostr-mail bridge only (default for local dev)
// "resend" = send via Lambda/Resend only
// "both"   = send both nostr-mail and Lambda/Resend (production default)
type MailMode = 'nostr' | 'resend' | 'both';

const MAIL_MODE: MailMode =
  (import.meta.env.VITE_MAIL_MODE as MailMode | undefined) ??
  'nostr';

interface ReportNotification {
  title: string;
  type: string;
  severity: string;
  description: string;
  location: string;
  lat: number;
  lng: number;
  district?: string;
  reporterName: string;
  imageUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
}

export function useNostrMail() {
  const { nostr } = useNostr();
  const { logins } = useNostrLogin();

  /** Build common email fields shared by both paths.
   *  In dev mode (localhost), all emails go to croix4clerk@pm.me for testing.
   *  In production, emails route to the actual district contacts. */
  const buildEmailParts = useCallback((report: ReportNotification) => {
    // Dev mode: all emails go to default for testing.
    // Production: loaded from config.yaml at build time.
    const to = import.meta.env.DEV
      ? DEFAULT_NOTIFICATION_EMAIL
      : getDistrictEmail(report.district);
    const subject = `[${report.severity.toUpperCase()}] ${report.title}`;
    const reportUrl = `https://ftheroads.com/?lat=${report.lat}&lng=${report.lng}`;
    const mapsUrl = `https://www.google.com/maps?q=${report.lat},${report.lng}`;
    const date = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const typeLabel = report.type.charAt(0).toUpperCase() + report.type.slice(1);
    const locationPart = report.location ? ` (${report.location})` : '';

    // Plain text body
    const lines: string[] = [
      `${report.reporterName} reported a ${report.severity.toUpperCase()} severity ${typeLabel} on ${date} at ${report.lat}, ${report.lng}${locationPart}.`,
      '',
      `Link to Report: ${reportUrl}`,
    ];
    if (report.district) lines.push(`Records indicate this is handled by ${report.district}.`);

    const contactParts: string[] = [];
    if (report.contactEmail?.trim()) contactParts.push(report.contactEmail.trim());
    if (report.contactPhone?.trim()) contactParts.push(report.contactPhone.trim());
    console.log('[email] Contact info:', { email: report.contactEmail, phone: report.contactPhone, parts: contactParts });
    if (contactParts.length > 0) {
      lines.push(`${report.reporterName} requested follow-up at ${contactParts.join(' or ')}.`);
    }
    if (report.description) lines.push('', report.description);
    const text = lines.join('\n');

    // HTML body
    const htmlLines: string[] = [
      `<p>${report.reporterName} reported <strong>${report.severity.toUpperCase()}</strong> severity ${typeLabel} on ${date} at <a href="${mapsUrl}">${report.lat}, ${report.lng}</a>${locationPart}.</p>`,
      `<p><a href="${reportUrl}">Link to Report</a></p>`,
    ];
    if (report.district) htmlLines.push(`<p>Records indicate this is handled by ${report.district}.</p>`);
    if (contactParts.length > 0) htmlLines.push(`<p>${report.reporterName} requested follow-up at ${contactParts.join(' or ')}.</p>`);
    if (report.description) htmlLines.push(`<p>${report.description}</p>`);
    const html = htmlLines.join('\n');

    return { to, subject, text, html };
  }, []);

  /** Get target relays for publishing.
   *  Discovers the bridge's DM relays, then adds SDK defaults as fallback.
   *  The bridge operator controls which relays it monitors — we cast a wide net. */
  const getTargetRelays = useCallback(async (): Promise<string[]> => {
    const pool = new SimplePool();
    const discovered: string[] = [];

    try {
      // Check NIP-65 (kind 10002) for the bridge's write relays
      const nip65Events = await pool.querySync(BOOTSTRAP_RELAYS, {
        kinds: [10002],
        authors: [BRIDGE_PUBKEY],
      });

      const writeRelays: string[] = [];
      if (nip65Events.length > 0) {
        const latest = nip65Events.sort((a, b) => b.created_at - a.created_at)[0];
        latest.tags
          .filter(t => t[0] === 'r')
          .forEach(t => {
            const marker = t[2];
            if (!marker || marker === 'write') writeRelays.push(normalizeURL(t[1]));
          });
      }

      // Query NIP-17 DM relays (kind 10050)
      const discoveryRelays = Array.from(new Set([...BOOTSTRAP_RELAYS, ...writeRelays]));
      const dmRelayEvents = await pool.querySync(discoveryRelays, {
        kinds: [10050],
        authors: [BRIDGE_PUBKEY],
      });

      if (dmRelayEvents.length > 0) {
        const latest = dmRelayEvents.sort((a, b) => b.created_at - a.created_at)[0];
        latest.tags
          .filter(t => t[0] === 'relay')
          .map(t => normalizeURL(t[1]))
          .forEach(r => discovered.push(r));
      }
    } catch (err) {
      console.warn('[nostr-mail] Relay discovery failed:', err);
    } finally {
      pool.destroy();
    }

    // Merge discovered + all SDK defaults — maximize coverage
    const allRelays = Array.from(new Set([
      ...discovered,
      ...DEFAULT_DM_RELAYS,
      ...DEFAULT_RELAYS,
    ]));
    console.log(`[nostr-mail] Target relays (${allRelays.length}):`, allRelays);
    return allRelays;
  }, []);

  /** Send email via nostr-mail bridge at uid.ovh.
   *  Uses the uid.ovh bridge directly since pm.me has no _smtp NIP-05 entry.
   *  The bridge accepts kind 1301 events and SMTP-delivers to any email address.
   *  Flow: build MIME → wrap as kind 1301 → gift wrap (NIP-59) → publish to bridge's DM relays */
  const sendNostrMail = useCallback(async (report: ReportNotification) => {
    const nsecLogin = logins?.find(l => l.type === 'nsec');
    if (!nsecLogin || nsecLogin.type !== 'nsec') {
      throw new Error('Nostr-mail requires nsec login');
    }

    const decoded = nip19.decode(nsecLogin.data.nsec);
    const secretKey = decoded.data as Uint8Array;
    const pubkey = getPublicKey(secretKey);
    const npub = nip19.npubEncode(pubkey);
    const fromAddress = `${npub}@uid.ovh`;

    const { to, subject, text, html } = buildEmailParts(report);

    // Build RFC 2822 MIME email matching the format nmail sends.
    // The bridge (uid.ovh) parses MIME with postal-mime and validates From: against the sender's npub.
    // Format must match nmail exactly: From with display name, Message-Id, multipart/alternative.
    const msg = createMimeMessage();
    msg.setSender({ name: report.reporterName, addr: fromAddress });
    msg.setRecipient(to);
    msg.setSubject(subject);
    msg.setHeader('Message-Id', `<${crypto.randomUUID()}@uid.ovh>`);
    msg.addMessage({ contentType: 'text/plain', data: text });
    msg.addMessage({ contentType: 'text/html', data: html });
    const mime = msg.asRaw();

    // Build the kind 1301 email event for the district.
    // Keep tags minimal — nmail only uses a single 'p' tag for the recipient.
    // Extra tags (subject, from, to, etc.) cause the bridge to reject the event.
    const bridgeEvent = {
      kind: 1301,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['p', BRIDGE_PUBKEY]],
      content: mime,
    };

    const selfCopyEvent = {
      kind: 1301,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['p', pubkey]],
      content: mime,
    };

    // BCC: separate kind 1301 event with To: = admin email.
    // The bridge ignores BCC MIME headers, so we send a second event entirely.
    const bccMsg = createMimeMessage();
    bccMsg.setSender({ name: report.reporterName, addr: fromAddress });
    bccMsg.setRecipient(ADMIN_EMAIL);
    bccMsg.setSubject(subject);
    bccMsg.setHeader('Message-Id', `<${crypto.randomUUID()}@uid.ovh>`);
    bccMsg.addMessage({ contentType: 'text/plain', data: text });
    bccMsg.addMessage({ contentType: 'text/html', data: html });
    const bccMime = bccMsg.asRaw();

    const bccEvent = {
      kind: 1301,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['p', BRIDGE_PUBKEY]],
      content: bccMime,
    };

    // NIP-59 gift wrapping via nostr-tools (signs the seal correctly)
    const wrappedEvent = wrapEvent(bridgeEvent, secretKey, BRIDGE_PUBKEY);
    console.log(`[nostr-mail] Gift-wrapped event ${wrappedEvent.id.slice(0, 12)}`);

    // Self-copy: wrap for ourselves
    const selfWrappedEvent = wrapEvent(selfCopyEvent, secretKey, pubkey);

    // BCC: wrap for admin (separate event, bridge delivers to admin email)
    const bccWrappedEvent = wrapEvent(bccEvent, secretKey, BRIDGE_PUBKEY);
    console.log(`[nostr-mail] BCC gift-wrapped event ${bccWrappedEvent.id.slice(0, 12)}`);

    // --- Publish gift-wrapped events to bridge relays ---
    // uid.ovh relays require NIP-42 auth. We publish via two paths:
    // 1. NPool (primary): handles NIP-42 auth via NostrProvider's auth callback,
    //    and we explicitly target nostr-01.uid.ovh to ensure the bridge sees events.
    // 2. SimplePool (broad): publishes to all discovered relays as backup coverage.

    const uidRelays = ['wss://nostr-01.uid.ovh'];

    // Primary: NPool publish to uid.ovh relays with NIP-42 auth support
    try {
      await nostr.event(wrappedEvent, { relays: uidRelays, signal: AbortSignal.timeout(15000) });
      await nostr.event(selfWrappedEvent, { relays: uidRelays, signal: AbortSignal.timeout(15000) });
      await nostr.event(bccWrappedEvent, { relays: uidRelays, signal: AbortSignal.timeout(15000) });
      console.log(`[nostr-mail] NPool publish to uid.ovh succeeded`);
    } catch (err) {
      console.warn('[nostr-mail] NPool publish to uid.ovh failed:', err);
    }

    // Broad: SimplePool to all discovered + default relays (auth via onauth)
    const targetRelays = await getTargetRelays();
    console.log(`[nostr-mail] SimplePool publishing to ${targetRelays.length} relays`);

    const pool = new SimplePool();
    const authHandler = async (authEvent: Parameters<typeof finalizeEvent>[0]) => {
      return finalizeEvent(authEvent, secretKey);
    };

    try {
      const allPromises = [
        ...pool.publish(targetRelays, wrappedEvent, { onauth: authHandler }),
        ...pool.publish(targetRelays, selfWrappedEvent, { onauth: authHandler }),
        ...pool.publish(targetRelays, bccWrappedEvent, { onauth: authHandler }),
      ];
      const results = await Promise.allSettled(allPromises);
      const ok = results.filter(r => r.status === 'fulfilled').length;
      console.log(`[nostr-mail] SimplePool ${ok}/${allPromises.length} publishes succeeded`);
    } catch (err) {
      console.warn('[nostr-mail] SimplePool publish error:', err);
    } finally {
      pool.destroy();
    }
  }, [logins, buildEmailParts, getTargetRelays]);

  /** Send email via Lambda/Resend. */
  const sendResendEmail = useCallback(async (report: ReportNotification) => {
    if (!LAMBDA_URL) {
      throw new Error('VITE_LAMBDA_URL not configured');
    }

    const { to, subject, text, html } = buildEmailParts(report);
    console.log('[email] Sending to:', to, 'subject:', subject);

    try {
      const response = await fetch(LAMBDA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, text, html, imageUrl: report.imageUrl }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[email] Failed:', response.status, error);
        throw new Error(`Email failed: ${response.status} ${error}`);
      }

      const result = await response.json();
      console.log('[email] Sent:', result);
      return result;
    } catch (err) {
      // fetch() throws TypeError on CORS/network errors, but the Lambda likely
      // still processed the request (fire-and-forget POST).
      if (err instanceof TypeError) {
        console.warn('[email] Response unreadable (CORS), but request likely sent:', err.message);
        return { success: true, note: 'Request sent but response blocked by browser CORS policy' };
      }
      throw err;
    }
  }, [buildEmailParts]);

  /** Send a NIP-17 DM to the admin when report or email errors occur.
   *  Uses NIP-59 gift wrapping (kind 14 → seal → gift wrap) for privacy.
   *  Fire-and-forget — errors here are logged but never block the caller. */
  const sendErrorDM = useCallback(async (context: {
    error: string;
    reportTitle?: string;
    reportType?: string;
    severity?: string;
    reporterName?: string;
    lat?: number;
    lng?: number;
    district?: string;
  }) => {
    const nsecLogin = logins?.find(l => l.type === 'nsec');
    if (!nsecLogin || nsecLogin.type !== 'nsec') {
      console.warn('[error-dm] No nsec login, skipping admin DM');
      return;
    }

    try {
      const secretKey = nip19.decode(nsecLogin.data.nsec).data as Uint8Array;
      const pubkey = getPublicKey(secretKey);

      // Build a human-readable error summary
      const lines = [
        '⚠️ FtheRoads Error Report ⚠️',
        '',
        `❌ ERROR: ${context.error}`,
        `🕐 Time: ${new Date().toISOString()}`,
        '',
        '--- Report Context ---',
      ];
      if (context.reportTitle) lines.push(`Title: ${context.reportTitle}`);
      if (context.reportType) lines.push(`Type: ${context.reportType}`);
      if (context.severity) lines.push(`Severity: ${context.severity}`);
      if (context.reporterName) lines.push(`Reporter: ${context.reporterName}`);
      if (context.lat != null && context.lng != null) {
        lines.push(`Location: ${context.lat}, ${context.lng}`);
      }
      if (context.district) lines.push(`District: ${context.district}`);

      const content = lines.join('\n');

      // Create kind 14 private direct message, gift-wrap via NIP-59
      const dmEvent = {
        kind: 14,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', ADMIN_PUBKEY]],
        content,
      };

      const wrappedDM = wrapEvent(dmEvent, secretKey, ADMIN_PUBKEY);

      // Self-copy so the sender can see the DM in nmail
      const selfDMEvent = {
        kind: 14,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', pubkey]],
        content,
      };
      const selfWrappedDM = wrapEvent(selfDMEvent, secretKey, pubkey);

      // Publish to uid.ovh relays (NPool with auth)
      const uidRelays = ['wss://nostr-01.uid.ovh'];
      try {
        await nostr.event(wrappedDM, { relays: uidRelays, signal: AbortSignal.timeout(10000) });
        await nostr.event(selfWrappedDM, { relays: uidRelays, signal: AbortSignal.timeout(10000) });
        console.log('[error-dm] NPool publish succeeded');
      } catch (err) {
        console.warn('[error-dm] NPool publish failed:', err);
      }

      // Broad: SimplePool for relay coverage
      const pool = new SimplePool();
      const authHandler = async (authEvent: Parameters<typeof finalizeEvent>[0]) => {
        return finalizeEvent(authEvent, secretKey);
      };
      const allRelays = [...DEFAULT_DM_RELAYS, ...DEFAULT_RELAYS];

      try {
        const results = await Promise.allSettled([
          ...pool.publish(allRelays, wrappedDM, { onauth: authHandler }),
          ...pool.publish(allRelays, selfWrappedDM, { onauth: authHandler }),
        ]);
        const ok = results.filter(r => r.status === 'fulfilled').length;
        console.log(`[error-dm] SimplePool ${ok}/${results.length} publishes succeeded`);
      } catch (err) {
        console.warn('[error-dm] SimplePool publish error:', err);
      } finally {
        pool.destroy();
      }
    } catch (err) {
      console.error('[error-dm] Failed to send admin DM:', err);
    }
  }, [logins, nostr]);

  /** Main entry point — routes to the configured mail mode(s). */
  const sendReportNotification = useCallback(async (report: ReportNotification) => {
    const errors: string[] = [];

    if (MAIL_MODE === 'nostr' || MAIL_MODE === 'both') {
      try {
        await sendNostrMail(report);
        console.log('[mail] Nostr-mail sent successfully');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Nostr-mail failed';
        console.error('[mail] Nostr-mail error:', msg);
        errors.push(msg);
      }
    }

    if (MAIL_MODE === 'resend' || MAIL_MODE === 'both') {
      try {
        await sendResendEmail(report);
        console.log('[mail] Resend email sent successfully');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Resend email failed';
        console.error('[mail] Resend error:', msg);
        errors.push(msg);
      }
    }

    // If ALL configured methods failed, throw
    const expectedCount = MAIL_MODE === 'both' ? 2 : 1;
    if (errors.length === expectedCount) {
      throw new Error(errors.join('; '));
    }

    return { success: true };
  }, [sendNostrMail, sendResendEmail]);

  return { sendReportNotification, sendErrorDM, mailMode: MAIL_MODE };
}
