import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useLoggedInAccounts } from '@/hooks/useLoggedInAccounts';

import type { NostrEvent } from '@nostrify/nostrify';

// --- Hoisted mocks (available inside vi.mock factories) ---

const { mockQuery, mockParse, mockPipe, mockJson, mockMetadata } = vi.hoisted(() => {
  const mockParse = vi.fn();
  const mockMetadata = vi.fn(() => 'metadata-schema');
  const mockPipe = vi.fn(() => ({ parse: mockParse }));
  const mockJson = vi.fn(() => ({ pipe: mockPipe }));
  const mockQuery = vi.fn();
  return { mockQuery, mockParse, mockPipe, mockJson, mockMetadata };
});

// Module-level mutable logins array — tests reassign per scenario
let mockLogins: { id: string; pubkey: string }[] = [];

vi.mock('@nostrify/react', () => ({
  useNostr: () => ({ nostr: { query: mockQuery } }),
}));

vi.mock('@nostrify/react/login', () => ({
  useNostrLogin: () => ({
    logins: mockLogins,
    setLogin: vi.fn(),
    removeLogin: vi.fn(),
  }),
}));

// Mock NSchema chain: n.json().pipe(n.metadata()).parse(content)
// The metadata() function is passed as argument to pipe() but the mock
// ignores it — parse() is the only method that matters for behavior.
vi.mock('@nostrify/nostrify', () => ({
  NSchema: { json: mockJson, metadata: mockMetadata },
}));

// QueryClient wrapper -- disables retry so errors propagate immediately
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

// Helper: build a kind-0 NostrEvent (metadata) for a given pubkey
function makeEvent(pubkey: string, content: Record<string, string> = {}): NostrEvent {
  return {
    id: `evt-${pubkey}`,
    kind: 0,
    pubkey,
    created_at: 1_700_000_000,
    tags: [],
    content: JSON.stringify(content),
    sig: 'fake-sig',
  };
}

// --- Tests ---

describe('useLoggedInAccounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset logins before each test
    mockLogins = [];
    // Default: successful parse returning whatever content was passed
    mockParse.mockImplementation((c: string) => JSON.parse(c));
  });

  // 1. Returns empty authors when no logins
  it('returns empty authors when no logins', async () => {
    mockLogins = [];
    // The hook still queries (no enabled guard) but returns empty array
    mockQuery.mockResolvedValue([]);

    const { result } = renderHook(() => useLoggedInAccounts(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.authors).toEqual([]));
    expect(result.current.authors).toEqual([]);
  });

  // 2. Fetches kind 0 events for logged-in pubkeys
  it('fetches kind 0 events for logged-in pubkeys', async () => {
    mockLogins = [
      { id: 'login-1', pubkey: 'pk-alice' },
      { id: 'login-2', pubkey: 'pk-bob' },
    ];
    mockQuery.mockResolvedValue([
      makeEvent('pk-alice', { name: 'Alice', picture: 'https://example.com/alice.jpg' }),
      makeEvent('pk-bob', { name: 'Bob', picture: 'https://example.com/bob.jpg' }),
    ]);

    renderHook(() => useLoggedInAccounts(), { wrapper: createWrapper() });

    await waitFor(() => expect(mockQuery).toHaveBeenCalled());
    expect(mockQuery).toHaveBeenCalledWith(
      [{ kinds: [0], authors: ['pk-alice', 'pk-bob'] }],
      expect.any(Object), // { signal: AbortSignal }
    );
  });

  // 3. Returns currentUser as first login
  it('returns currentUser as first login', async () => {
    mockLogins = [
      { id: 'login-1', pubkey: 'pk-alice' },
      { id: 'login-2', pubkey: 'pk-bob' },
    ];
    const aliceEvent = makeEvent('pk-alice', { name: 'Alice', picture: 'https://example.com/alice.jpg' });
    const bobEvent = makeEvent('pk-bob', { name: 'Bob', picture: 'https://example.com/bob.jpg' });
    mockQuery.mockResolvedValue([aliceEvent, bobEvent]);

    const { result } = renderHook(() => useLoggedInAccounts(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.authors.length).toBe(2));
    expect(result.current.currentUser).toEqual({
      id: 'login-1',
      pubkey: 'pk-alice',
      metadata: { name: 'Alice', picture: 'https://example.com/alice.jpg' },
      event: aliceEvent,
    });
  });

  // 4. Returns otherUsers as remaining logins
  it('returns otherUsers as remaining logins', async () => {
    mockLogins = [
      { id: 'login-1', pubkey: 'pk-alice' },
      { id: 'login-2', pubkey: 'pk-bob' },
      { id: 'login-3', pubkey: 'pk-carol' },
    ];
    const aliceEvent = makeEvent('pk-alice', { name: 'Alice' });
    const bobEvent = makeEvent('pk-bob', { name: 'Bob' });
    const carolEvent = makeEvent('pk-carol', { name: 'Carol' });
    mockQuery.mockResolvedValue([aliceEvent, bobEvent, carolEvent]);

    const { result } = renderHook(() => useLoggedInAccounts(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.authors.length).toBe(3));
    // otherUsers is authors.slice(1) -- bob and carol
    expect(result.current.otherUsers).toHaveLength(2);
    expect(result.current.otherUsers[0]).toEqual({
      id: 'login-2',
      pubkey: 'pk-bob',
      metadata: { name: 'Bob' },
      event: bobEvent,
    });
    expect(result.current.otherUsers[1]).toEqual({
      id: 'login-3',
      pubkey: 'pk-carol',
      metadata: { name: 'Carol' },
      event: carolEvent,
    });
  });

  // 5. Handles metadata parse failure gracefully (returns empty metadata)
  it('handles metadata parse failure gracefully', async () => {
    mockLogins = [{ id: 'login-1', pubkey: 'pk-alice' }];
    const aliceEvent = makeEvent('pk-alice', { name: 'Alice' });
    mockQuery.mockResolvedValue([aliceEvent]);
    // Simulate parse failure
    mockParse.mockImplementation(() => {
      throw new Error('Invalid metadata');
    });

    const { result } = renderHook(() => useLoggedInAccounts(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.authors.length).toBe(1));
    expect(result.current.authors[0]).toEqual({
      id: 'login-1',
      pubkey: 'pk-alice',
      metadata: {},
      event: aliceEvent,
    });
  });

  // 6. Returns undefined currentUser when no logins
  it('returns undefined currentUser when no logins', async () => {
    mockLogins = [];

    const { result } = renderHook(() => useLoggedInAccounts(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.authors).toEqual([]));
    expect(result.current.currentUser).toBeUndefined();
  });
});
