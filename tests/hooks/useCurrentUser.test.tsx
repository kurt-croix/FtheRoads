import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LoginType = Record<string, any>;

// --- Hoisted mock functions ---

const mockFromNsecLogin = vi.fn(() => ({ pubkey: 'nsec-user-pubkey' }));
const mockFromBunkerLogin = vi.fn(() => ({ pubkey: 'bunker-user-pubkey' }));
const mockFromExtensionLogin = vi.fn(() => ({ pubkey: 'ext-user-pubkey' }));

// Mutable logins array that individual tests can modify
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockLogins: LoginType[] = [];

const mockUseAuthor = vi.fn(() => ({
  data: { metadata: { name: 'TestUser' }, event: { id: 'ev1' } },
}));

// --- Module mocks ---

vi.mock('@nostrify/react', () => ({
  useNostr: () => ({ nostr: {} }),
}));

vi.mock('@nostrify/react/login', () => ({
  NUser: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fromNsecLogin: (...args: any[]) => mockFromNsecLogin(...args),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fromBunkerLogin: (...args: any[]) => mockFromBunkerLogin(...args),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fromExtensionLogin: (...args: any[]) => mockFromExtensionLogin(...args),
  },
  useNostrLogin: () => ({ logins: mockLogins }),
}));

vi.mock('@/hooks/useAuthor', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useAuthor: (...args: any[]) => mockUseAuthor(...args),
}));

// --- QueryClient wrapper ---
// useAuthor uses React Query internally, so we need a provider.

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

// --- Tests ---

describe('useCurrentUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset logins before each test
    mockLogins = [];
  });

  // 1. Returns no user when no logins exist
  it('returns no user when no logins', () => {
    mockLogins = [];

    const { result } = renderHook(() => useCurrentUser(), {
      wrapper: createWrapper(),
    });

    expect(result.current.user).toBeUndefined();
    expect(result.current.users).toEqual([]);
  });

  // 2. Converts nsec login to NUser via NUser.fromNsecLogin
  it('converts nsec login to NUser', () => {
    const nsecLogin = { type: 'nsec', id: 'login-1' };
    mockLogins = [nsecLogin];

    const { result } = renderHook(() => useCurrentUser(), {
      wrapper: createWrapper(),
    });

    expect(mockFromNsecLogin).toHaveBeenCalledWith(nsecLogin);
    expect(result.current.user).toEqual({ pubkey: 'nsec-user-pubkey' });
  });

  // 3. Converts bunker login to NUser, passing nostr instance
  it('converts bunker login to NUser (with nostr)', () => {
    const bunkerLogin = { type: 'bunker', id: 'login-2' };
    mockLogins = [bunkerLogin];

    const { result } = renderHook(() => useCurrentUser(), {
      wrapper: createWrapper(),
    });

    expect(mockFromBunkerLogin).toHaveBeenCalledWith(bunkerLogin, {});
    expect(result.current.user).toEqual({ pubkey: 'bunker-user-pubkey' });
  });

  // 4. Converts extension login to NUser
  it('converts extension login to NUser', () => {
    const extLogin = { type: 'extension', id: 'login-3' };
    mockLogins = [extLogin];

    const { result } = renderHook(() => useCurrentUser(), {
      wrapper: createWrapper(),
    });

    expect(mockFromExtensionLogin).toHaveBeenCalledWith(extLogin);
    expect(result.current.user).toEqual({ pubkey: 'ext-user-pubkey' });
  });

  // 5. Skips invalid login types and logs a warning
  it('skips invalid login types (logs warning)', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const invalidLogin = { type: 'unknown', id: 'bad-login' };
    mockLogins = [invalidLogin];

    const { result } = renderHook(() => useCurrentUser(), {
      wrapper: createWrapper(),
    });

    // The unsupported type throws, which is caught and logged
    expect(result.current.user).toBeUndefined();
    expect(result.current.users).toEqual([]);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Skipped invalid login',
      'bad-login',
      expect.any(Error),
    );

    consoleWarnSpy.mockRestore();
  });

  // 6. Returns first user as the current user
  it('returns first user as current user', () => {
    mockLogins = [
      { type: 'nsec', id: 'first' },
      { type: 'extension', id: 'second' },
    ];

    const { result } = renderHook(() => useCurrentUser(), {
      wrapper: createWrapper(),
    });

    // user should be the first one (nsec)
    expect(result.current.user).toEqual({ pubkey: 'nsec-user-pubkey' });
  });

  // 7. Returns all converted users in the users array
  it('returns all users array', () => {
    mockLogins = [
      { type: 'nsec', id: 'first' },
      { type: 'bunker', id: 'second' },
      { type: 'extension', id: 'third' },
    ];

    const { result } = renderHook(() => useCurrentUser(), {
      wrapper: createWrapper(),
    });

    expect(result.current.users).toHaveLength(3);
    expect(result.current.users).toEqual([
      { pubkey: 'nsec-user-pubkey' },
      { pubkey: 'bunker-user-pubkey' },
      { pubkey: 'ext-user-pubkey' },
    ]);
  });

  // 8. Passes user pubkey to useAuthor
  it('passes user pubkey to useAuthor', () => {
    mockLogins = [{ type: 'nsec', id: 'login-1' }];

    renderHook(() => useCurrentUser(), {
      wrapper: createWrapper(),
    });

    expect(mockUseAuthor).toHaveBeenCalledWith('nsec-user-pubkey');
  });
});
