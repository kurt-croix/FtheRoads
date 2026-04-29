import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useComments } from '@/hooks/useComments';

// --- Mocks ---

const mockQuery = vi.fn();
vi.mock('@nostrify/react', () => ({
  useNostr: () => ({ nostr: { query: mockQuery } }),
}));

vi.mock('@nostrify/nostrify', () => ({
  NKinds: {
    addressable: (kind: number) => kind >= 30000 && kind < 40000,
    replaceable: (kind: number) => kind >= 10000 && kind < 20000,
  },
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

/** Builds a minimal NostrEvent (kind 1111 comment) with the given overrides. */
function makeComment(overrides: Partial<{
  id: string;
  kind: number;
  pubkey: string;
  content: string;
  created_at: number;
  extraTags: string[][];
}> = {}): NostrEvent {
  const {
    id = `cmt-${Math.random().toString(36).slice(2, 10)}`,
    kind = 1111,
    pubkey = 'fake-pubkey',
    content = 'Nice post',
    created_at = 1_700_000_000,
    extraTags = [],
  } = overrides;

  return {
    id,
    kind,
    pubkey,
    created_at,
    tags: extraTags,
    content,
    sig: 'fake-sig',
  };
}

/** Builds a minimal root NostrEvent with the given overrides. */
function makeRootEvent(overrides: Partial<{
  id: string;
  kind: number;
  pubkey: string;
  created_at: number;
  extraTags: string[][];
}> = {}): NostrEvent {
  const {
    id = `root-${Math.random().toString(36).slice(2, 10)}`,
    kind = 1,
    pubkey = 'root-pubkey',
    created_at = 1_699_999_000,
    extraTags = [],
  } = overrides;

  return {
    id,
    kind,
    pubkey,
    created_at,
    tags: extraTags,
    content: 'Root event',
    sig: 'fake-sig',
  };
}

// --- Tests ---

describe('useComments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Regular event root -> filter uses #E
  it('queries with #E filter for regular events', async () => {
    const root = makeRootEvent({ kind: 1 });
    mockQuery.mockResolvedValue([]);

    renderHook(() => useComments(root), { wrapper: createWrapper() });

    await waitFor(() => expect(mockQuery).toHaveBeenCalled());
    const filter = mockQuery.mock.calls[0][0][0];
    expect(filter).toEqual({ kinds: [1111], '#E': [root.id] });
  });

  // 2. Addressable event root (kind 30000-39999) -> filter uses #A
  it('queries with #A filter for addressable events', async () => {
    const root = makeRootEvent({
      kind: 30023,
      pubkey: 'author-pub',
      extraTags: [['d', 'my-article']],
    });
    mockQuery.mockResolvedValue([]);

    renderHook(() => useComments(root), { wrapper: createWrapper() });

    await waitFor(() => expect(mockQuery).toHaveBeenCalled());
    const filter = mockQuery.mock.calls[0][0][0];
    expect(filter).toEqual({
      kinds: [1111],
      '#A': ['30023:author-pub:my-article'],
    });
  });

  // 3. Replaceable event root (kind 10000-19999) -> filter uses #A with empty d
  it('queries with #A filter for replaceable events', async () => {
    const root = makeRootEvent({ kind: 10002, pubkey: 'relay-pub' });
    mockQuery.mockResolvedValue([]);

    renderHook(() => useComments(root), { wrapper: createWrapper() });

    await waitFor(() => expect(mockQuery).toHaveBeenCalled());
    const filter = mockQuery.mock.calls[0][0][0];
    expect(filter).toEqual({
      kinds: [1111],
      '#A': ['10002:relay-pub:'],
    });
  });

  // 4. String root (hashtag) -> filter uses #I
  it('queries with #I filter for string root', async () => {
    const hashtag = '#roads';
    mockQuery.mockResolvedValue([]);

    renderHook(() => useComments(hashtag), { wrapper: createWrapper() });

    await waitFor(() => expect(mockQuery).toHaveBeenCalled());
    const filter = mockQuery.mock.calls[0][0][0];
    expect(filter).toEqual({ kinds: [1111], '#I': ['#roads'] });
  });

  // 5. URL root -> filter uses #I
  it('queries with #I filter for URL root', async () => {
    const url = new URL('https://example.com/post/1');
    mockQuery.mockResolvedValue([]);

    renderHook(() => useComments(url), { wrapper: createWrapper() });

    await waitFor(() => expect(mockQuery).toHaveBeenCalled());
    const filter = mockQuery.mock.calls[0][0][0];
    expect(filter).toEqual({
      kinds: [1111],
      '#I': ['https://example.com/post/1'],
    });
  });

  // 6. Limit is applied to the filter
  it('applies limit to filter when provided', async () => {
    const root = makeRootEvent({ kind: 1 });
    mockQuery.mockResolvedValue([]);

    renderHook(() => useComments(root, 25), { wrapper: createWrapper() });

    await waitFor(() => expect(mockQuery).toHaveBeenCalled());
    const filter = mockQuery.mock.calls[0][0][0];
    expect(filter.limit).toBe(25);
  });

  // 7. topLevelComments filters correctly (only comments matching root)
  it('returns topLevelComments filtered correctly', async () => {
    const root = makeRootEvent({ kind: 1 });
    const topComment = makeComment({
      extraTags: [['e', root.id]],
      created_at: 1_700_000_100,
    });
    // Unrelated comment that references a different root
    const unrelated = makeComment({
      extraTags: [['e', 'some-other-id']],
      created_at: 1_700_000_200,
    });
    mockQuery.mockResolvedValue([topComment, unrelated]);

    const { result } = renderHook(() => useComments(root), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Only the comment whose 'e' tag matches root.id is top-level
    expect(result.current.data!.topLevelComments).toHaveLength(1);
    expect(result.current.data!.topLevelComments[0].id).toBe(topComment.id);
  });

  // 8. getDescendants returns nested replies recursively
  it('getDescendants returns nested replies recursively', async () => {
    const root = makeRootEvent({ kind: 1 });
    // Top-level comment
    const c1 = makeComment({
      id: 'c1',
      extraTags: [['e', root.id]],
      created_at: 1_700_000_100,
    });
    // Reply to c1
    const c2 = makeComment({
      id: 'c2',
      extraTags: [['e', 'c1']],
      created_at: 1_700_000_200,
    });
    // Reply to c2 (nested deeper)
    const c3 = makeComment({
      id: 'c3',
      extraTags: [['e', 'c2']],
      created_at: 1_700_000_300,
    });
    mockQuery.mockResolvedValue([c1, c2, c3]);

    const { result } = renderHook(() => useComments(root), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const descendants = result.current.data!.getDescendants('c1');
    // Should include c2 (direct reply to c1) and c3 (reply to c2)
    const ids = descendants.map((e: NostrEvent) => e.id);
    expect(ids).toContain('c2');
    expect(ids).toContain('c3');
    expect(descendants).toHaveLength(2);
  });

  // 9. getDirectReplies returns only direct children
  it('getDirectReplies returns only direct children', async () => {
    const root = makeRootEvent({ kind: 1 });
    const c1 = makeComment({
      id: 'c1',
      extraTags: [['e', root.id]],
      created_at: 1_700_000_100,
    });
    const c2 = makeComment({
      id: 'c2',
      extraTags: [['e', 'c1']],
      created_at: 1_700_000_200,
    });
    const c3 = makeComment({
      id: 'c3',
      extraTags: [['e', 'c2']],
      created_at: 1_700_000_300,
    });
    mockQuery.mockResolvedValue([c1, c2, c3]);

    const { result } = renderHook(() => useComments(root), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Direct replies to c1 should only be c2, not c3
    const directReplies = result.current.data!.getDirectReplies('c1');
    expect(directReplies).toHaveLength(1);
    expect(directReplies[0].id).toBe('c2');
  });

  // 10. Disabled when root is falsy (empty string -- !!'' is false)
  it('is disabled when root is falsy', () => {
    const { result } = renderHook(() => useComments(''), {
      wrapper: createWrapper(),
    });

    // enabled: !!root -> false when root is '', so query stays idle
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
