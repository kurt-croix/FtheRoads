import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';

// --- Shared mocks (declared before vi.mock so they're hoisted correctly) ---

const mockSignEvent = vi.fn();
const mockNostrEvent = vi.fn();

vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: vi.fn(() => ({
    user: { pubkey: 'test-pubkey', signer: { signEvent: mockSignEvent } },
  })),
}));

vi.mock('@nostrify/react', () => ({
  useNostr: () => ({ nostr: { event: mockNostrEvent } }),
}));

// Imports must come after vi.mock calls
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';

// --- Helpers ---

/** Creates a fresh QueryClientProvider wrapper. Disables retries so errors surface immediately. */
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

/** Builds a signed NostrEvent matching what user.signer.signEvent would return. */
function makeSignedEvent(overrides: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: 'evt-123',
    kind: 1,
    pubkey: 'test-pubkey',
    created_at: 1_700_000_000,
    tags: [],
    content: 'hello',
    sig: 'fake-sig',
    ...overrides,
  };
}

// --- Tests ---

describe('useNostrPublish', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Restore the default useCurrentUser mock after each test.
    // vi.clearAllMocks() wipes mockReturnValue, so we re-apply the default.
    vi.mocked(useCurrentUser).mockReturnValue({
      user: { pubkey: 'test-pubkey', signer: { signEvent: mockSignEvent } },
    } as ReturnType<typeof useCurrentUser>);
  });

  // ---------------------------------------------------------------
  // 1. Throws "User is not logged in" when no user
  // ---------------------------------------------------------------
  it('throws "User is not logged in" when no user', async () => {
    // Override the default mock to return no user for this test only
    vi.mocked(useCurrentUser).mockReturnValueOnce({ user: undefined } as ReturnType<typeof useCurrentUser>);

    mockSignEvent.mockResolvedValue(makeSignedEvent());

    const { result } = renderHook(() => useNostrPublish(), {
      wrapper: createWrapper(),
    });

    // Trigger the mutation
    await act(async () => {
      result.current.mutate({ kind: 1, content: 'test' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('User is not logged in');

    // Signer and nostr.event should NOT have been called
    expect(mockSignEvent).not.toHaveBeenCalled();
    expect(mockNostrEvent).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------
  // 2. Signs event with user signer
  // ---------------------------------------------------------------
  it('signs event with user signer', async () => {
    const signedEvent = makeSignedEvent();
    mockSignEvent.mockResolvedValue(signedEvent);
    mockNostrEvent.mockResolvedValue(undefined);

    const { result } = renderHook(() => useNostrPublish(), {
      wrapper: createWrapper(),
    });

    const template = { kind: 1, content: 'hello world', tags: [] };
    await act(async () => {
      result.current.mutate(template);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockSignEvent).toHaveBeenCalledOnce();
    const signArg = mockSignEvent.mock.calls[0][0];

    // The signer receives the kind and content from the template
    expect(signArg.kind).toBe(1);
    expect(signArg.content).toBe('hello world');
    // created_at defaults to Math.floor(Date.now() / 1000) when not provided
    expect(signArg.created_at).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------
  // 3. Publishes signed event to nostr
  // ---------------------------------------------------------------
  it('publishes signed event to nostr', async () => {
    const signedEvent = makeSignedEvent();
    mockSignEvent.mockResolvedValue(signedEvent);
    mockNostrEvent.mockResolvedValue(undefined);

    const { result } = renderHook(() => useNostrPublish(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ kind: 1, content: 'test' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // nostr.event is called with the signed event
    expect(mockNostrEvent).toHaveBeenCalledOnce();
    expect(mockNostrEvent).toHaveBeenCalledWith(signedEvent, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  // ---------------------------------------------------------------
  // 4. Adds client tag when on https
  // ---------------------------------------------------------------
  it('adds client tag when on https', async () => {
    // Simulate https environment
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { protocol: 'https:', hostname: 'example.com' },
    });

    const signedEvent = makeSignedEvent();
    mockSignEvent.mockResolvedValue(signedEvent);
    mockNostrEvent.mockResolvedValue(undefined);

    const { result } = renderHook(() => useNostrPublish(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ kind: 1, content: 'https test' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // The tags passed to signEvent should include the client tag
    const signArg = mockSignEvent.mock.calls[0][0];
    expect(signArg.tags).toContainEqual(['client', 'example.com']);

    // Restore original location
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    });
  });

  // ---------------------------------------------------------------
  // 5. Does not add client tag when not on https
  // ---------------------------------------------------------------
  it('does not add client tag when not on https', async () => {
    // Simulate http (non-https) environment
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { protocol: 'http:', hostname: 'localhost' },
    });

    const signedEvent = makeSignedEvent();
    mockSignEvent.mockResolvedValue(signedEvent);
    mockNostrEvent.mockResolvedValue(undefined);

    const { result } = renderHook(() => useNostrPublish(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ kind: 1, content: 'http test' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // No client tag should be added on non-https
    const signArg = mockSignEvent.mock.calls[0][0];
    const clientTags = signArg.tags.filter(([name]: [string]) => name === 'client');
    expect(clientTags).toHaveLength(0);

    // Restore original location
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    });
  });

  // ---------------------------------------------------------------
  // 6. Does not add duplicate client tag
  // ---------------------------------------------------------------
  it('does not add duplicate client tag', async () => {
    // Simulate https environment
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { protocol: 'https:', hostname: 'example.com' },
    });

    const signedEvent = makeSignedEvent();
    mockSignEvent.mockResolvedValue(signedEvent);
    mockNostrEvent.mockResolvedValue(undefined);

    const { result } = renderHook(() => useNostrPublish(), {
      wrapper: createWrapper(),
    });

    // Pass a template that already has a client tag
    await act(async () => {
      result.current.mutate({
        kind: 1,
        content: 'existing client tag',
        tags: [['client', 'my-custom-client']],
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Should not add a second client tag since one already exists
    const signArg = mockSignEvent.mock.calls[0][0];
    const clientTags = signArg.tags.filter(([name]: [string]) => name === 'client');
    expect(clientTags).toHaveLength(1);
    expect(clientTags[0]).toEqual(['client', 'my-custom-client']);

    // Restore original location
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    });
  });

  // ---------------------------------------------------------------
  // 7. Returns signed event on success
  // ---------------------------------------------------------------
  it('returns signed event on success', async () => {
    const signedEvent = makeSignedEvent({
      id: 'unique-evt-id',
      kind: 1,
      content: 'returned event',
    });
    mockSignEvent.mockResolvedValue(signedEvent);
    mockNostrEvent.mockResolvedValue(undefined);

    const { result } = renderHook(() => useNostrPublish(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ kind: 1, content: 'returned event' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // The mutation result data is the signed event returned by signer.signEvent
    expect(result.current.data).toEqual(signedEvent);
    expect(result.current.data?.id).toBe('unique-evt-id');
  });
});
