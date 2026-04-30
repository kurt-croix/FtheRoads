import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import type { NostrEvent } from '@nostrify/nostrify';
import { KIND_ROAD_REPORT } from '@/lib/constants';

/** Validates that a kind 1031 event has the required tags */
function validateRoadReport(event: NostrEvent): boolean {
  if (event.kind !== KIND_ROAD_REPORT) return false;

  const hasD = event.tags.some(([name]) => name === 'd');
  const hasG = event.tags.some(([name]) => name === 'g');
  const hasType = event.tags.some(([name]) => name === 'type');
  const hasSeverity = event.tags.some(([name]) => name === 'severity');
  const hasAlt = event.tags.some(([name]) => name === 'alt');

  return hasD && hasG && hasType && hasSeverity && hasAlt;
}

export interface RoadReport {
  event: NostrEvent;
  id: string;
  title: string;
  type: string;
  severity: string;
  geohash: string;
  location: string;
  description: string;
  images: string[];
  district: string;
  status: string;
  lat?: number;
  lng?: number;
  createdAt: number;
}

/** Parse a Nostr event into a structured RoadReport */
function parseReport(event: NostrEvent): RoadReport {
  const getTag = (name: string) => event.tags.find(([n]) => n === name)?.[1] ?? '';
  const getAllTags = (name: string) => event.tags.filter(([n]) => n === name).map(([, v]) => v);

  const geohash = getTag('g');
  const images = getAllTags('image');

  // Try to extract lat/lng from geohash or additional tags
  // Some clients may include explicit lat/lng in location tag
  let lat: number | undefined;
  let lng: number | undefined;

  // Check for explicit coordinate tags
  const latTag = event.tags.find(([n]) => n === 'latitude' || n === 'lat')?.[1];
  const lngTag = event.tags.find(([n]) => n === 'longitude' || n === 'lng')?.[1];

  if (latTag && lngTag) {
    lat = parseFloat(latTag);
    lng = parseFloat(lngTag);
  }

  return {
    event,
    id: event.id,
    title: getTag('title') || 'Untitled Report',
    type: getTag('type'),
    severity: getTag('severity'),
    geohash,
    location: getTag('location'),
    description: event.content,
    images,
    district: getTag('district'),
    status: getTag('status') || 'open',
    lat,
    lng,
    createdAt: event.created_at,
  };
}

/** Hook to query all road reports from Nostr */
export function useRoadReports() {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['road-reports'],
    queryFn: async () => {
      const events = await nostr.query([{
        kinds: [KIND_ROAD_REPORT],
        limit: 200,
      }], { signal: AbortSignal.timeout(10000) });

      // Fetch kind 5 deletion events and filter out deleted reports
      const deletions = await nostr.query([{
        kinds: [5],
        limit: 200,
      }], { signal: AbortSignal.timeout(5000) }).catch(() => [] as NostrEvent[]);

      const deletedIds = new Set(
        deletions.flatMap(e => e.tags.filter(([name]) => name === 'e').map(([, id]) => id))
      );

      const validEvents = events.filter(validateRoadReport)
        .filter(e => !deletedIds.has(e.id));
      const reports = validEvents.map(parseReport);

      // Sort by creation time, newest first
      reports.sort((a, b) => b.createdAt - a.createdAt);

      return reports;
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}

/** Hook to query road reports filtered by type */
export function useRoadReportsByType(type: string) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['road-reports', 'type', type],
    queryFn: async () => {
      const events = await nostr.query([{
        kinds: [KIND_ROAD_REPORT],
        '#type': [type],
        limit: 100,
      }], { signal: AbortSignal.timeout(10000) });

      return events.filter(validateRoadReport).map(parseReport);
    },
    enabled: !!type,
  });
}

/** Hook to query a single road report by event ID */
export function useRoadReport(eventId: string) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['road-report', eventId],
    queryFn: async () => {
      const events = await nostr.query([{
        kinds: [KIND_ROAD_REPORT],
        ids: [eventId],
        limit: 1,
      }], { signal: AbortSignal.timeout(10000) });

      const event = events[0];
      if (!event || !validateRoadReport(event)) return null;

      return parseReport(event);
    },
    enabled: !!eventId,
  });
}
