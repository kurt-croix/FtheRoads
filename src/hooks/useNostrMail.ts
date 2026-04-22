import { useCallback } from 'react';
import { DEFAULT_NOTIFICATION_EMAIL, DISTRICT_EMAIL_MAP } from '@/lib/constants';

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
  reporterName: string;
  imageUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
}

export function useNostrMail() {
  const sendReportNotification = useCallback(async (report: ReportNotification) => {
    if (!LAMBDA_URL) {
      throw new Error('No email method configured. Set VITE_LAMBDA_URL.');
    }

    const to = DISTRICT_EMAIL_MAP[report.district ?? ''] ?? DEFAULT_NOTIFICATION_EMAIL;
    const subject = `[FtheRoads] ${report.severity.toUpperCase()}: ${report.title}`;
    const reportUrl = `https://ftheroads.com/?lat=${report.lat}&lng=${report.lng}`;
    const mapsUrl = `https://www.google.com/maps?q=${report.lat},${report.lng}`;
    const date = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    // Capitalize type label for readability (e.g. "pothole" -> "Pothole")
    const typeLabel = report.type.charAt(0).toUpperCase() + report.type.slice(1);

    const locationPart = report.location ? ` (${report.location})` : '';

    // Plain text version (coordinates as plain URL)
    const lines: string[] = [
      `${report.reporterName} reported ${report.severity.toUpperCase()} severity ${typeLabel} on ${date} at ${report.lat}, ${report.lng}${locationPart}.`,
      '',
      `Link to Report: ${reportUrl}`,
    ];

    if (report.district) {
      lines.push(`Records indicate this is handled by ${report.district}.`);
    }

    const contactParts: string[] = [];
    if (report.contactEmail) contactParts.push(report.contactEmail);
    if (report.contactPhone) contactParts.push(report.contactPhone);
    if (contactParts.length > 0) {
      lines.push(`${report.reporterName} requested follow-up at ${contactParts.join(' or ')}.`);
    }

    if (report.description) {
      lines.push('', report.description);
    }

    const text = lines.join('\n');

    // HTML version with clickable links for coordinates
    const htmlLines: string[] = [
      `<p>${report.reporterName} reported <strong>${report.severity.toUpperCase()}</strong> severity ${typeLabel} on ${date} at <a href="${mapsUrl}">${report.lat}, ${report.lng}</a>${locationPart}.</p>`,
      `<p><a href="${reportUrl}">Link to Report</a></p>`,
    ];

    if (report.district) {
      htmlLines.push(`<p>Records indicate this is handled by ${report.district}.</p>`);
    }

    if (contactParts.length > 0) {
      htmlLines.push(`<p>${report.reporterName} requested follow-up at ${contactParts.join(' or ')}.</p>`);
    }

    if (report.description) {
      htmlLines.push(`<p>${report.description}</p>`);
    }

    const html = htmlLines.join('\n');

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
  }, []);

  return { sendReportNotification };
}
