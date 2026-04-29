// FtheRoads.com - Constants
import yaml from 'js-yaml';
// @ts-expect-error — Vite ?raw import returns file content as string
import configRaw from '../../config.yaml?raw';

/** Nostr event kind for road hazard reports */
export const KIND_ROAD_REPORT = 1031;

/** Ray County, MO center coordinates (WGS84) */
export const RAY_COUNTY_CENTER: [number, number] = [39.4, -93.9];

/** Default map zoom level */
export const DEFAULT_ZOOM = 11;

/** Road districts (derived from rayCountyTownships.json polygon names) */

/** Hazard type definitions */
export const HAZARD_TYPES = [
  { value: 'pothole', label: 'Pothole', icon: '🔴' },
  { value: 'ditch', label: 'Ditch / Shoulder Damage', icon: '🟠' },
  { value: 'obstruction', label: 'Road Obstruction', icon: '🟡' },
  { value: 'flooding', label: 'Flooding / Drainage', icon: '🔵' },
  { value: 'sign', label: 'Sign Damage / Missing', icon: '🟣' },
  { value: 'guardrail', label: 'Guardrail Damage', icon: '⚪' },
  { value: 'bridge', label: 'Bridge Issue', icon: '🟤' },
  { value: 'other', label: 'Other', icon: '⚫' },
] as const;

/** Severity levels */
export const SEVERITY_LEVELS = [
  { value: 'low', label: 'Low', color: '#22c55e' },
  { value: 'medium', label: 'Medium', color: '#f59e0b' },
  { value: 'high', label: 'High', color: '#f97316' },
  { value: 'critical', label: 'Critical', color: '#ef4444' },
] as const;

/** Status values */
export const REPORT_STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'fixed', label: 'Fixed' },
] as const;

/** Default email for notifications (fallback for districts without a contact) */
export const DEFAULT_NOTIFICATION_EMAIL = 'croix4clerk@pm.me';

/** Polygon data for district boundaries */
export { default as DISTRICT_POLYGONS } from '@/data/rayCountyTownships.json';

/**
 * Admin npub for error notifications (nostr DM) and BCC on report emails.
 * Receives a NIP-17 DM when report/email errors occur.
 */
export const ADMIN_NPUB = 'npub17w98lrsg36nj0cckhxgd52wdlrgnx544lgy4jsg3fwpla7jtvlaqgjdrc6';

/** Admin nostr-mail address (uid.ovh bridge resolves npub → mailbox) */
export const ADMIN_EMAIL = `${ADMIN_NPUB}@uid.ovh`;

/**
 * District email config parsed from config.yaml at build time.
 * Falls back to DEFAULT_NOTIFICATION_EMAIL if config unavailable.
 */
const config = yaml.load(configRaw) as {
  districtEmails?: { default?: string; districts?: Record<string, string> };
};

const _districtEmails = config.districtEmails?.districts ?? {};
const _defaultDistrictEmail = config.districtEmails?.default ?? DEFAULT_NOTIFICATION_EMAIL;

/** Get notification email for a road district */
export function getDistrictEmail(district: string | undefined): string {
  return _districtEmails[district ?? ''] ?? _defaultDistrictEmail;
}
