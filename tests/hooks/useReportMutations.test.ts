import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { RoadReport } from '@/hooks/useRoadReports';

// --- Mocks ---

const mockMutateAsync = vi.fn();
vi.mock('@/hooks/useNostrPublish', () => ({
  useNostrPublish: () => ({ mutateAsync: mockMutateAsync }),
}));

const mockInvalidateQueries = vi.fn();
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

const mockToast = vi.fn();
vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/lib/constants', () => ({
  KIND_ROAD_REPORT: 1031,
}));

// Imports must come after vi.mock calls
import { useDeleteReport, useEditReport } from '@/hooks/useReportMutations';

// --- Helpers ---

/** Build a mock RoadReport with a full set of event tags. */
function makeReport(overrides: Partial<RoadReport> = {}): RoadReport {
  return {
    id: 'evt-abc123',
    title: 'Pothole on Main St',
    type: 'pothole',
    severity: 'high',
    geohash: '9zn0e',
    location: 'Main St & 1st Ave',
    description: 'Large pothole near intersection',
    images: [
      'https://example.com/img1.jpg',
      'https://example.com/img2.jpg',
    ],
    district: 'Richmond',
    status: 'open',
    lat: 39.4,
    lng: -93.9,
    createdAt: 1_700_000_000,
    event: {
      id: 'evt-abc123',
      kind: 1031,
      pubkey: 'fake-pubkey',
      created_at: 1_700_000_000,
      content: 'Large pothole near intersection',
      sig: 'fake-sig',
      tags: [
        ['d', 'report-001'],
        ['g', '9zn0e'],
        ['title', 'Pothole on Main St'],
        ['type', 'pothole'],
        ['severity', 'high'],
        ['status', 'open'],
        ['alt', '290'],
        ['lat', '39.4'],
        ['lng', '-93.9'],
        ['location', 'Main St & 1st Ave'],
        ['district', 'Richmond'],
        ['image', 'https://example.com/img1.jpg'],
        ['image', 'https://example.com/img2.jpg'],
      ],
    },
    ...overrides,
  };
}

// --- Tests ---

describe('useDeleteReport', () => {
  let deleteReport: ReturnType<typeof useDeleteReport>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValue({});
    // Render the hook to get the returned async function
    const { result } = renderHook(() => useDeleteReport());
    deleteReport = result.current;
  });

  it('publishes kind 5 with e tag pointing to the report id', async () => {
    const report = makeReport();
    await deleteReport(report);

    expect(mockMutateAsync).toHaveBeenCalledOnce();
    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 5,
        content: 'Deleted by author',
        tags: [['e', report.id]],
      }),
    );
    // Verify created_at is a recent unix timestamp (not stale or zero)
    const call = mockMutateAsync.mock.calls[0][0];
    expect(call.created_at).toBeGreaterThan(0);
  });

  it('invalidates road-reports queries', async () => {
    await deleteReport(makeReport());

    expect(mockInvalidateQueries).toHaveBeenCalledOnce();
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['road-reports'],
    });
  });

  it('shows a "Report Deleted" toast', async () => {
    await deleteReport(makeReport());

    expect(mockToast).toHaveBeenCalledOnce();
    expect(mockToast).toHaveBeenCalledWith({ title: 'Report Deleted' });
  });
});

describe('useEditReport', () => {
  let editReport: (report: RoadReport, updates: Parameters<typeof useEditReport extends () => infer R ? R : never>[1]) => Promise<void>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValue({});
    const { result } = renderHook(() => useEditReport());
    editReport = result.current;
  });

  it('preserves existing tags when no updates are provided', async () => {
    const report = makeReport();
    await editReport(report, {});

    // First call: the new kind 1031 event
    const editCall = mockMutateAsync.mock.calls[0][0];
    expect(editCall.kind).toBe(1031);

    // All original values should be preserved
    const tags = editCall.tags;
    expect(tags).toContainEqual(['d', 'report-001']);
    expect(tags).toContainEqual(['g', '9zn0e']);
    expect(tags).toContainEqual(['title', 'Pothole on Main St']);
    expect(tags).toContainEqual(['type', 'pothole']);
    expect(tags).toContainEqual(['severity', 'high']);
    expect(tags).toContainEqual(['status', 'open']);
    expect(tags).toContainEqual(['location', 'Main St & 1st Ave']);
    expect(tags).toContainEqual(['district', 'Richmond']);
    expect(tags).toContainEqual(['lat', '39.4']);
    expect(tags).toContainEqual(['lng', '-93.9']);

    // Content preserved from report description
    expect(editCall.content).toBe('Large pothole near intersection');
  });

  it('applies updates to specific fields', async () => {
    const report = makeReport();
    await editReport(report, {
      title: 'Updated Title',
      severity: 'critical',
      description: 'New description text',
      status: 'resolved',
    });

    const editCall = mockMutateAsync.mock.calls[0][0];
    const tags = editCall.tags;

    // Updated fields
    expect(tags).toContainEqual(['title', 'Updated Title']);
    expect(tags).toContainEqual(['severity', 'critical']);
    expect(tags).toContainEqual(['status', 'resolved']);
    expect(editCall.content).toBe('New description text');

    // Unchanged fields should still carry original values
    expect(tags).toContainEqual(['type', 'pothole']);
    expect(tags).toContainEqual(['location', 'Main St & 1st Ave']);
    expect(tags).toContainEqual(['d', 'report-001']);
    expect(tags).toContainEqual(['g', '9zn0e']);
  });

  it('publishes kind 1031 (edit) and kind 5 (delete old)', async () => {
    const report = makeReport();
    await editReport(report, { title: 'Changed' });

    // Two publish calls: first the new event, then the delete of the old
    expect(mockMutateAsync).toHaveBeenCalledTimes(2);

    // First call: new report event
    expect(mockMutateAsync.mock.calls[0][0]).toEqual(
      expect.objectContaining({ kind: 1031 }),
    );

    // Second call: deletion event referencing the original report id
    expect(mockMutateAsync.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        kind: 5,
        content: 'Replaced by edit',
        tags: [['e', report.id]],
      }),
    );
  });

  it('invalidates road-reports queries', async () => {
    await editReport(makeReport(), {});

    expect(mockInvalidateQueries).toHaveBeenCalledOnce();
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['road-reports'],
    });
  });

  it('preserves image tags from the original report', async () => {
    const report = makeReport();
    await editReport(report, {});

    const editCall = mockMutateAsync.mock.calls[0][0];
    const imageTags = editCall.tags.filter(([name]: [string]) => name === 'image');

    // Both original image URLs should be present
    expect(imageTags).toEqual([
      ['image', 'https://example.com/img1.jpg'],
      ['image', 'https://example.com/img2.jpg'],
    ]);
  });
});
