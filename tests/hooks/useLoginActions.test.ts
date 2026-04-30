import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// -- Mutable mock state ------------------------------------------------------
// Tests can mutate these to override the default mock return values.

const mockAddLogin = vi.fn();
const mockRemoveLogin = vi.fn();
const mockFromNsec = vi.fn();
const mockFromBunker = vi.fn();
const mockFromExtension = vi.fn();
const mockFromNostrConnect = vi.fn();

const mockLoginState = {
  logins: [{ id: 'login-1', type: 'nsec' }] as Array<{ id: string; type: string }>,
};

const mockRelayState = {
  relays: [
    { url: 'wss://relay1.com', write: true },
    { url: 'wss://relay2.com', write: false },
    { url: 'wss://relay3.com', write: true },
  ],
};

// -- Mocks -------------------------------------------------------------------

vi.mock('@nostrify/react', () => ({
  useNostr: () => ({ nostr: {} }),
}));

vi.mock('@nostrify/react/login', () => ({
  NLogin: {
    fromNsec: (...args: any[]) => {
      mockFromNsec(...args);
      return { type: 'nsec', id: 'login-1' };
    },
    fromBunker: (...args: any[]) => {
      mockFromBunker(...args);
      return Promise.resolve({ type: 'bunker', id: 'login-2' });
    },
    fromExtension: () => {
      mockFromExtension();
      return Promise.resolve({ type: 'extension', id: 'login-3' });
    },
    fromNostrConnect: (...args: any[]) => {
      mockFromNostrConnect(...args);
      return Promise.resolve({ type: 'nostrconnect', id: 'login-4' });
    },
  },
  // useNostrLogin reads from the mutable mockLoginState so tests can override
  useNostrLogin: () => ({
    logins: mockLoginState.logins,
    addLogin: mockAddLogin,
    removeLogin: mockRemoveLogin,
  }),
  generateNostrConnectParams: vi.fn(() => ({ pubkey: 'test', secret: 'test' })),
  generateNostrConnectURI: vi.fn(() => 'nostrconnect://test'),
}));

vi.mock('@/hooks/useAppContext', () => ({
  // useAppContext reads from the mutable mockRelayState so tests can override
  useAppContext: () => ({
    config: {
      relayMetadata: {
        relays: mockRelayState.relays,
      },
    },
  }),
}));

// Import after mocks are set up
import { useLoginActions } from '@/hooks/useLoginActions';

// -- Tests -------------------------------------------------------------------

describe('useLoginActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mutable state to defaults before each test
    mockLoginState.logins = [{ id: 'login-1', type: 'nsec' }];
    mockRelayState.relays = [
      { url: 'wss://relay1.com', write: true },
      { url: 'wss://relay2.com', write: false },
      { url: 'wss://relay3.com', write: true },
    ];
  });

  // -- nsec ------------------------------------------------------------------

  it('nsec() creates NLogin.fromNsec and calls addLogin', () => {
    const { result } = renderHook(() => useLoginActions());

    act(() => {
      result.current.nsec('nsec1abc123');
    });

    expect(mockFromNsec).toHaveBeenCalledWith('nsec1abc123');
    expect(mockAddLogin).toHaveBeenCalledWith({ type: 'nsec', id: 'login-1' });
  });

  // -- bunker ----------------------------------------------------------------

  it('bunker() creates NLogin.fromBunker and calls addLogin', async () => {
    const { result } = renderHook(() => useLoginActions());

    await act(async () => {
      await result.current.bunker('bunker://test');
    });

    expect(mockFromBunker).toHaveBeenCalledWith('bunker://test', {});
    expect(mockAddLogin).toHaveBeenCalledWith({ type: 'bunker', id: 'login-2' });
  });

  // -- extension -------------------------------------------------------------

  it('extension() creates NLogin.fromExtension and calls addLogin', async () => {
    const { result } = renderHook(() => useLoginActions());

    await act(async () => {
      await result.current.extension();
    });

    expect(mockFromExtension).toHaveBeenCalled();
    expect(mockAddLogin).toHaveBeenCalledWith({ type: 'extension', id: 'login-3' });
  });

  // -- nostrconnect ----------------------------------------------------------

  it('nostrconnect() creates NLogin.fromNostrConnect and calls addLogin', async () => {
    const { result } = renderHook(() => useLoginActions());
    const params = { pubkey: 'test', secret: 'test' };
    const signal = new AbortController().signal;

    await act(async () => {
      await result.current.nostrconnect(params, signal);
    });

    expect(mockFromNostrConnect).toHaveBeenCalledWith(params, {}, { signal });
    expect(mockAddLogin).toHaveBeenCalledWith({ type: 'nostrconnect', id: 'login-4' });
  });

  // -- getRelayUrls ----------------------------------------------------------

  it('getRelayUrls() returns only write-enabled relays', () => {
    const { result } = renderHook(() => useLoginActions());

    const urls = result.current.getRelayUrls();

    expect(urls).toEqual(['wss://relay1.com', 'wss://relay3.com']);
  });

  it('getRelayUrls() falls back to damus relay when no write relays', () => {
    // Override relay state to have no write-enabled relays
    mockRelayState.relays = [
      { url: 'wss://readonly.com', write: false },
    ];

    const { result } = renderHook(() => useLoginActions());

    const urls = result.current.getRelayUrls();

    expect(urls).toEqual(['wss://relay.damus.io']);
  });

  // -- logout ----------------------------------------------------------------

  it('logout() removes first login', async () => {
    const { result } = renderHook(() => useLoginActions());

    await act(async () => {
      await result.current.logout();
    });

    expect(mockRemoveLogin).toHaveBeenCalledWith('login-1');
  });

  it('logout() does nothing when no logins', async () => {
    // Override login state to have no logins
    mockLoginState.logins = [];

    const { result } = renderHook(() => useLoginActions());

    await act(async () => {
      await result.current.logout();
    });

    expect(mockRemoveLogin).not.toHaveBeenCalled();
  });
});
