import { useCallback } from 'react';
import { useNostrLogin } from '@nostrify/react/login';
import { nip19 } from 'nostr-tools';
import { NostrMailClient } from 'nostr-mail';
import { DEFAULT_NOTIFICATION_EMAIL, DISTRICT_EMAIL_MAP } from '@/lib/constants';

// --- uid.ovh nostr-mail bridge (confirmed via NIP-05 _smtp@uid.ovh) ---
// The bridge accepts kind 1301 events (wrapped in NIP-59 gift wraps)
// and SMTP-delivers the MIME email to the address in the To: header.
const BRIDGE_PUBKEY = '0d365385f474d4b025377b4ade6ad241f847d514a9e9b475069f69a20f886c68';

// --- Lambda email (Resend) ---
/** Read at call time so tests can override via vi.stubEnv. */
function getLambdaUrl(): string | undefined {
  return import.meta.env.VITE_LAMBDA_URL as string | undefined;
}

// --- Mail mode configuration ---
// "nostr"  = send via nostr-mail bridge only (default for local dev)
// "resend" = send via Lambda/Resend only
// "both"   = send both nostr-mail and Lambda/Resend (production default)
type MailMode = 'nostr' | 'resend' | 'both';

/** Read mail mode at call time so tests can override via vi.stubEnv. */
function getMailMode(): MailMode {
  return (import.meta.env.VITE_MAIL_MODE as MailMode | undefined) ?? 'nostr';
}

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
  const { logins } = useNostrLogin();

  /** Build common email fields shared by both nostr and resend paths. */
  const buildEmailParts = useCallback((report: ReportNotification) => {
    const to = DISTRICT_EMAIL_MAP[report.district ?? ''] ?? DEFAULT_NOTIFICATION_EMAIL;
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

  /** Send email via nostr-mail bridge using the official nostr-mail SDK.
   *  NostrMailClient handles MIME construction, kind 1301 event creation with
   *  proper tags (subject, from, to, date), NIP-59 gift wrapping, relay
   *  discovery (NIP-65 + NIP-17), and publishing with NIP-42 auth.
   *  We send to the bridge pubkey — the bridge reads MIME To: for SMTP routing. */
  const sendNostrMail = useCallback(async (report: ReportNotification) => {
    const nsecLogin = logins?.find(l => l.type === 'nsec');
    if (!nsecLogin || nsecLogin.type !== 'nsec') {
      throw new Error('Nostr-mail requires nsec login');
    }

    const decoded = nip19.decode(nsecLogin.data.nsec);
    const secretKey = decoded.data as Uint8Array;

    const { to, subject, text, html } = buildEmailParts(report);

    // Use the official nostr-mail SDK client.
    // It handles MIME format (npub@nostr from address), kind 1301 event tags,
    // NIP-59 gift wrapping, relay discovery, and publishing with auth.
    const client = new NostrMailClient(secretKey);

    try {
      console.log(`[nostr-mail] Sending report to ${to} via SDK`);
      await client.sendEmail({
        to: BRIDGE_PUBKEY,
        subject,
        text,
        html,
        selfCopy: true,
      });
      console.log('[nostr-mail] Email sent successfully');
    } finally {
      await client.close();
    }
  }, [logins, buildEmailParts]);

  /** Send email via Lambda/Resend. */
  const sendResendEmail = useCallback(async (report: ReportNotification) => {
    const lambdaUrl = getLambdaUrl();
    if (!lambdaUrl) {
      throw new Error('VITE_LAMBDA_URL not configured');
    }

    const { to, subject, text, html } = buildEmailParts(report);
    console.log('[email] Sending to:', to, 'subject:', subject);

    try {
      const response = await fetch(lambdaUrl, {
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

  /** Main entry point — routes to the configured mail mode(s). */
  const sendReportNotification = useCallback(async (report: ReportNotification) => {
    const errors: string[] = [];
    const mailMode = getMailMode();

    if (mailMode === 'nostr' || mailMode === 'both') {
      try {
        await sendNostrMail(report);
        console.log('[mail] Nostr-mail sent successfully');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Nostr-mail failed';
        console.error('[mail] Nostr-mail error:', msg);
        errors.push(msg);
      }
    }

    if (mailMode === 'resend' || mailMode === 'both') {
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
    const expectedCount = mailMode === 'both' ? 2 : 1;
    if (errors.length === expectedCount) {
      throw new Error(errors.join('; '));
    }

    return { success: true };
  }, [sendNostrMail, sendResendEmail]);

  return { sendReportNotification, mailMode: getMailMode() };
}
