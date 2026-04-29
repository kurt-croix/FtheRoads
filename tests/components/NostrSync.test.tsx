import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { NostrSync } from '@/components/NostrSync';

// --- Mocks ---

const mockQuery = vi.fn();
vi.mock('@nostrify/react', () => ({
  useNostr: () => ({ nostr: { query: mockQuery } }),
}));

const mockUseCurrentUser = vi.fn();
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => mockUseCurrentUser(),
}));

const mockUpdateConfig = vi.fn();
const mockUseAppContext = vi.fn();
vi.mock('@/hooks/useAppContext', () => ({
  useAppContext: () => mockUseAppContext(),
}));

// --- Helpers ---

/** Default user with a known pubkey for "logged in" scenarios. */
const loggedInUser = { user: { pubkey: 'test-pk' } };

/** No user (logged out). */
const loggedOutUser = { user: undefined };

/** Default app context config with zero updatedAt. */
function defaultAppContext(overrides: { updatedAt?: number; relays?: unknown[] } = {}) {
  return {
    config: {
      relayMetadata: {
        updatedAt: overrides.updatedAt ?? 0,
        relays: overrides.relays ?? [],
      },
    },
    updateConfig: mockUpdateConfig,
  };
}

/** Build a kind-10002 relay list event. */
function makeRelayEvent(
  tags: string[][],
  overrides: { created_at?: number } = {},
) {
  return {
    id: 'evt-1',
    kind: 10002,
    pubkey: 'test-pk',
    created_at: overrides.created_at ?? 1000,
    tags,
    content: '',
    sig: 'sig',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: logged in, no prior relay data.
  mockUseCurrentUser.mockReturnValue(loggedInUser);
  mockUseAppContext.mockReturnValue(defaultAppContext());
  // Default: query returns empty array.
  mockQuery.mockResolvedValue([]);
});

// --- Tests ---

describe('NostrSync', () => {
  // 1. Does nothing when no user
  it('does nothing when no user', async () => {
    mockUseCurrentUser.mockReturnValue(loggedOutUser);

    render(<NostrSync />);

    await waitFor(() => {
      expect(mockQuery).not.toHaveBeenCalled();
    });
    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });

  // 2. Queries kind 10002 events when user exists
  it('queries kind 10002 events when user exists', async () => {
    render(<NostrSync />);

    await waitFor(() => {
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    const [filters, options] = mockQuery.mock.calls[0];
    expect(filters).toEqual([{ kinds: [10002], authors: ['test-pk'], limit: 1 }]);
    // Should pass a timeout signal
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  // 3. Updates config when newer relay event found
  it('updates config when newer relay event found', async () => {
    const event = makeRelayEvent(
      [['r', 'wss://relay.example.com', 'read']],
      { created_at: 2000 },
    );
    mockQuery.mockResolvedValue([event]);

    render(<NostrSync />);

    await waitFor(() => {
      expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    });

    // updateConfig receives a callback; invoke it with current state to inspect result.
    const callback = mockUpdateConfig.mock.calls[0][0];
    const currentState = {
      relayMetadata: { updatedAt: 0, relays: [] },
    };
    const result = callback(currentState);

    expect(result.relayMetadata.updatedAt).toBe(2000);
    expect(result.relayMetadata.relays).toEqual([
      { url: 'wss://relay.example.com', read: true, write: false },
    ]);
  });

  // 4. Parses relay tags with markers (read/write)
  it('parses relay tags with explicit markers', async () => {
    const event = makeRelayEvent([
      ['r', 'wss://read.relay.com', 'read'],
      ['r', 'wss://write.relay.com', 'write'],
    ]);
    mockQuery.mockResolvedValue([event]);

    render(<NostrSync />);

    await waitFor(() => {
      expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    });

    const callback = mockUpdateConfig.mock.calls[0][0];
    const result = callback({ relayMetadata: { updatedAt: 0, relays: [] } });

    expect(result.relayMetadata.relays).toEqual([
      { url: 'wss://read.relay.com', read: true, write: false },
      { url: 'wss://write.relay.com', read: false, write: true },
    ]);
  });

  // 5. Parses relay tags without markers (both read+write)
  it('parses relay tags without markers as both read and write', async () => {
    const event = makeRelayEvent([
      ['r', 'wss://both.relay.com'],
    ]);
    mockQuery.mockResolvedValue([event]);

    render(<NostrSync />);

    await waitFor(() => {
      expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    });

    const callback = mockUpdateConfig.mock.calls[0][0];
    const result = callback({ relayMetadata: { updatedAt: 0, relays: [] } });

    // When marker is undefined, both read and write should be true
    expect(result.relayMetadata.relays).toEqual([
      { url: 'wss://both.relay.com', read: true, write: true },
    ]);
  });

  // 6. Does not update when event is older than stored
  it('does not update when event is older than stored metadata', async () => {
    mockUseAppContext.mockReturnValue(defaultAppContext({ updatedAt: 5000 }));

    const event = makeRelayEvent(
      [['r', 'wss://old.relay.com', 'read']],
      { created_at: 3000 }, // older than stored updatedAt of 5000
    );
    mockQuery.mockResolvedValue([event]);

    render(<NostrSync />);

    await waitFor(() => {
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });

  // 7. Does not update when no relay tags found
  it('does not update when event has no relay tags', async () => {
    const event = makeRelayEvent([]); // no 'r' tags at all
    mockQuery.mockResolvedValue([event]);

    render(<NostrSync />);

    await waitFor(() => {
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });

  // 8. Handles query error gracefully
  it('handles query error gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockQuery.mockRejectedValue(new Error('Network failure'));

    render(<NostrSync />);

    await waitFor(() => {
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    expect(mockUpdateConfig).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to sync relays from Nostr:',
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });
});
