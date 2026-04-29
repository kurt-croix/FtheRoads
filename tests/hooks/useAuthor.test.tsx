import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAuthor } from '@/hooks/useAuthor';

import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';

// --- Hoisted mocks (available inside vi.mock factories) ---

const { mockQuery, mockParse, mockPipe, mockJson, mockMetadata } = vi.hoisted(() => {
  const mockParse = vi.fn();
  const mockPipe = vi.fn(() => ({ parse: mockParse }));
  const mockJson = vi.fn(() => ({ pipe: mockPipe }));
  const mockMetadata = vi.fn(() => 'metadata-schema');
  const mockQuery = vi.fn();
  return { mockQuery, mockParse, mockPipe, mockJson, mockMetadata };
});

vi.mock('@nostrify/react', () => ({
  useNostr: () => ({ nostr: { query: mockQuery } }),
}));

// Mock NSchema chain: n.json().pipe(n.metadata()).parse(content)
vi.mock('@nostrify/nostrify', () => ({
  NSchema: {
    json: mockJson,
    metadata: mockMetadata,
  },
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

// Helper: build a kind-0 NostrEvent (metadata).
function makeEvent(overrides: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: 'evt-author-001',
    kind: 0,
    pubkey: 'test-pubkey',
    created_at: 1_700_000_000,
    tags: [],
    content: '{"name":"Test User","about":"Hello","picture":"https://example.com/pic.jpg"}',
    sig: 'fake-sig',
    ...overrides,
  };
}

// --- Tests ---

describe('useAuthor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: successful parse returning valid metadata
    mockParse.mockReturnValue({ name: 'Test User', about: 'Hello' });
  });

  // 1. Returns empty object when pubkey is undefined
  it('returns empty object when pubkey is undefined', async () => {
    const { result } = renderHook(() => useAuthor(undefined), {
      wrapper: createWrapper(),
    });

    // Wait for query to settle — returns {} without calling nostr
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({});
    expect(mockQuery).not.toHaveBeenCalled();
  });

  // 2. Returns metadata and event for valid pubkey
  it('returns metadata and event for valid pubkey', async () => {
    const event = makeEvent();
    const metadata: NostrMetadata = { name: 'Test User', about: 'Hello' };
    mockQuery.mockResolvedValue([event]);
    mockParse.mockReturnValue(metadata);

    const { result } = renderHook(() => useAuthor('test-pubkey'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ event, metadata });
  });

  // 3. Returns event without metadata when content parse fails
  it('returns event without metadata when content parse fails', async () => {
    const event = makeEvent({ content: 'not-valid-json' });
    mockQuery.mockResolvedValue([event]);
    mockParse.mockImplementation(() => {
      throw new Error('Parse error');
    });

    const { result } = renderHook(() => useAuthor('test-pubkey'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ event });
    expect(result.current.data?.metadata).toBeUndefined();
  });

  // 4. Throws/error when no event found for pubkey
  // The hook specifies retry: 3, which overrides QueryClient defaults.
  // Using fake timers to fast-forward through the exponential backoff.
  it('throws error when no event found for pubkey', async () => {
    vi.useFakeTimers();
    mockQuery.mockResolvedValue([]); // No events returned

    const { result } = renderHook(() => useAuthor('test-pubkey'), {
      wrapper: createWrapper(),
    });

    // Advance through retries: React Query retries with backoff (~1s, ~2s, ~4s)
    await vi.advanceTimersByTimeAsync(10_000);

    expect(result.current.isError).toBe(true);
    expect(result.current.error?.message).toBe('No event found');

    vi.useRealTimers();
  });

  // 5. Uses correct query filters (kinds: [0], authors: [pubkey])
  it('uses correct query filters', async () => {
    mockQuery.mockResolvedValue([makeEvent()]);

    renderHook(() => useAuthor('test-pubkey'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(mockQuery).toHaveBeenCalled());
    expect(mockQuery).toHaveBeenCalledWith(
      [{ kinds: [0], authors: ['test-pubkey'], limit: 1 }],
      expect.any(Object), // { signal: AbortSignal }
    );
  });
});
