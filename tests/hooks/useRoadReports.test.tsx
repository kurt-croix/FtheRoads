import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useRoadReports,
  useRoadReportsByType,
  useRoadReport,
} from '@/hooks/useRoadReports';

// --- Mocks ---

const mockQuery = vi.fn();
vi.mock('@nostrify/react', () => ({
  useNostr: () => ({ nostr: { query: mockQuery } }),
}));

// QueryClient wrapper — disables retry so errors propagate immediately
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

// Helper: build a valid NostrEvent for a road report.
// All required tags (d, g, type, severity, alt) are included by default;
// pass `omitTag` to leave one out for negative validation tests.
function makeEvent(overrides: Partial<{
  kind: number;
  content: string;
  created_at: number;
  omitTag: string;
  extraTags: string[][];
  noTitle: boolean;
  noStatus: boolean;
  noLat: boolean;
}> = {}): NostrEvent {
  const {
    kind = 1031,
    content = 'Large pothole on Main St',
    created_at = 1_700_000_000,
    omitTag,
    extraTags = [],
    noTitle = false,
    noStatus = false,
    noLat = false,
  } = overrides;

  // Core required tags for validateRoadReport
  const requiredTags: string[][] = [
    ['d', 'report-001'],
    ['g', '9zn0e'],
    ['type', 'pothole'],
    ['severity', 'high'],
    ['alt', '290'],
  ];

  // Remove the omitted tag if requested
  const tags = requiredTags
    .filter(([name]) => name !== omitTag)
    .concat(extraTags);

  // Optional fields tested via parseReport
  if (!noTitle) tags.push(['title', 'Pothole on Main St']);
  if (!noStatus) tags.push(['status', 'open']);
  if (!noLat) {
    tags.push(['lat', '39.4']);
    tags.push(['lng', '-93.9']);
  }
  tags.push(['location', 'Main St & 1st Ave']);
  tags.push(['district', 'Richmond']);
  tags.push(['image', 'https://example.com/img1.jpg']);
  tags.push(['image', 'https://example.com/img2.jpg']);

  return {
    id: `evt-${Math.random().toString(36).slice(2, 10)}`,
    kind,
    pubkey: 'fake-pubkey',
    created_at,
    tags,
    content,
    sig: 'fake-sig',
  };
}

// --- Tests ---

describe('useRoadReports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- validateRoadReport (tested indirectly) ---

  describe('validateRoadReport', () => {
    it('accepts valid kind 1031 with all required tags', async () => {
      mockQuery.mockResolvedValue([makeEvent()]);
      const { result } = renderHook(() => useRoadReports(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toHaveLength(1);
    });

    it('rejects events with wrong kind', async () => {
      mockQuery.mockResolvedValue([makeEvent({ kind: 1 })]);
      const { result } = renderHook(() => useRoadReports(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      // Invalid event filtered out
      expect(result.current.data).toHaveLength(0);
    });

    it('rejects events missing the d tag', async () => {
      mockQuery.mockResolvedValue([makeEvent({ omitTag: 'd' })]);
      const { result } = renderHook(() => useRoadReports(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toHaveLength(0);
    });

    it('rejects events missing the g tag', async () => {
      mockQuery.mockResolvedValue([makeEvent({ omitTag: 'g' })]);
      const { result } = renderHook(() => useRoadReports(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toHaveLength(0);
    });

    it('rejects events missing the type tag', async () => {
      mockQuery.mockResolvedValue([makeEvent({ omitTag: 'type' })]);
      const { result } = renderHook(() => useRoadReports(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toHaveLength(0);
    });

    it('rejects events missing the severity tag', async () => {
      mockQuery.mockResolvedValue([makeEvent({ omitTag: 'severity' })]);
      const { result } = renderHook(() => useRoadReports(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toHaveLength(0);
    });

    it('rejects events missing the alt tag', async () => {
      mockQuery.mockResolvedValue([makeEvent({ omitTag: 'alt' })]);
      const { result } = renderHook(() => useRoadReports(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toHaveLength(0);
    });
  });

  // --- parseReport (tested indirectly) ---

  describe('parseReport', () => {
    it('extracts all fields from event tags correctly', async () => {
      const event = makeEvent();
      mockQuery.mockResolvedValue([event]);
      const { result } = renderHook(
        () => useRoadReport(event.id),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      const report = result.current.data!;

      expect(report.id).toBe(event.id);
      expect(report.title).toBe('Pothole on Main St');
      expect(report.type).toBe('pothole');
      expect(report.severity).toBe('high');
      expect(report.geohash).toBe('9zn0e');
      expect(report.location).toBe('Main St & 1st Ave');
      expect(report.description).toBe('Large pothole on Main St');
      expect(report.district).toBe('Richmond');
      expect(report.status).toBe('open');
      expect(report.lat).toBeCloseTo(39.4);
      expect(report.lng).toBeCloseTo(-93.9);
      expect(report.createdAt).toBe(1_700_000_000);
      expect(report.images).toEqual([
        'https://example.com/img1.jpg',
        'https://example.com/img2.jpg',
      ]);
    });

    it('defaults title to "Untitled Report" when missing', async () => {
      const event = makeEvent({ noTitle: true });
      mockQuery.mockResolvedValue([event]);
      const { result } = renderHook(
        () => useRoadReport(event.id),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data!.title).toBe('Untitled Report');
    });

    it('defaults status to "open" when missing', async () => {
      const event = makeEvent({ noStatus: true });
      mockQuery.mockResolvedValue([event]);
      const { result } = renderHook(
        () => useRoadReport(event.id),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data!.status).toBe('open');
    });

    it('extracts lat/lng from latitude/longitude tags', async () => {
      // Build an event that uses 'latitude'/'longitude' instead of 'lat'/'lng'
      const event = makeEvent({ noLat: true, extraTags: [
        ['latitude', '39.123'],
        ['longitude', '-93.456'],
      ]});
      mockQuery.mockResolvedValue([event]);
      const { result } = renderHook(
        () => useRoadReport(event.id),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data!.lat).toBeCloseTo(39.123);
      expect(result.current.data!.lng).toBeCloseTo(-93.456);
    });

    it('extracts images from multiple image tags', async () => {
      const event = makeEvent({ extraTags: [
        ['image', 'https://example.com/extra.jpg'],
      ]});
      mockQuery.mockResolvedValue([event]);
      const { result } = renderHook(
        () => useRoadReport(event.id),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      // makeEvent already has 2 images; extraTags adds 1 more
      expect(result.current.data!.images).toHaveLength(3);
      expect(result.current.data!.images).toContain('https://example.com/extra.jpg');
    });
  });

  // --- useRoadReports hook ---

  describe('useRoadReports hook', () => {
    it('returns reports sorted newest first', async () => {
      const old = makeEvent({ created_at: 1_700_000_000 });
      const mid = makeEvent({ created_at: 1_700_000_100 });
      const newest = makeEvent({ created_at: 1_700_000_200 });
      // Return in random order
      mockQuery.mockResolvedValue([mid, newest, old]);

      const { result } = renderHook(() => useRoadReports(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      const times = result.current.data!.map((r) => r.createdAt);
      // Descending order
      expect(times).toEqual([
        1_700_000_200,
        1_700_000_100,
        1_700_000_000,
      ]);
    });

    it('filters out invalid events from the result set', async () => {
      const valid = makeEvent();
      const invalidKind = makeEvent({ kind: 1 }); // wrong kind
      const missingTag = makeEvent({ omitTag: 'g' }); // missing required tag
      mockQuery.mockResolvedValue([valid, invalidKind, missingTag]);

      const { result } = renderHook(() => useRoadReports(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toHaveLength(1);
      expect(result.current.data![0].id).toBe(valid.id);
    });
  });

  // --- useRoadReportsByType ---

  describe('useRoadReportsByType', () => {
    it('queries with type filter and returns matching reports', async () => {
      const event = makeEvent();
      mockQuery.mockResolvedValue([event]);

      const { result } = renderHook(
        () => useRoadReportsByType('pothole'),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      // Verify the query was called with the type filter
      expect(mockQuery).toHaveBeenCalledWith(
        [{ kinds: [1031], '#type': ['pothole'], limit: 100 }],
        expect.any(Object), // AbortSignal options
      );
      expect(result.current.data).toHaveLength(1);
    });

    it('is disabled when type is empty string', () => {
      const { result } = renderHook(
        () => useRoadReportsByType(''),
        { wrapper: createWrapper() }
      );

      // Query should not be enabled — fetchStatus stays idle
      expect(result.current.fetchStatus).toBe('idle');
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // --- useRoadReport (single) ---

  describe('useRoadReport (single)', () => {
    it('returns null when event fails validation', async () => {
      const badEvent = makeEvent({ kind: 1 });
      mockQuery.mockResolvedValue([badEvent]);

      const { result } = renderHook(
        () => useRoadReport(badEvent.id),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBeNull();
    });

    it('is disabled when eventId is empty string', () => {
      const { result } = renderHook(
        () => useRoadReport(''),
        { wrapper: createWrapper() }
      );

      expect(result.current.fetchStatus).toBe('idle');
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });
});
