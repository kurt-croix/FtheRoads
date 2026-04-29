import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React, { useContext } from 'react';
import { AppProvider } from '@/components/AppProvider';
import { AppContext } from '@/contexts/AppContext';
import type { AppConfig } from '@/contexts/AppContext';

// --- Mocks ---

// Mock useLocalStorage to return controlled state
const mockSetConfig = vi.fn();
let mockStoredConfig: Partial<AppConfig> = {};

vi.mock('@/hooks/useLocalStorage', () => ({
  useLocalStorage: vi.fn((_key: string, _defaultValue: unknown, _options?: unknown) => [
    mockStoredConfig,
    mockSetConfig,
  ]),
}));

// Mock zod so schema validation passes through without enforcing shape.
// Must be fully self-contained since vi.mock is hoisted above declarations.
vi.mock('zod', () => {
  const p: Record<string, unknown> = {
    parse: (v: unknown) => v,
  };
  // Make every method return `p` itself (chainable), except parse which returns input
  p.partial = () => p;
  p.object = () => p;
  p.enum = () => p;
  p.array = () => p;
  p.boolean = () => p;
  p.number = () => p;
  p.url = () => p;
  return { z: p };
});

// --- Helpers ---

/** Default config used across tests */
const defaultConfig: AppConfig = {
  theme: 'dark',
  relayMetadata: {
    relays: [{ url: 'wss://relay.example.com', read: true, write: true }],
    updatedAt: 1000000,
  },
};

/** Test child component that reads context and displays the theme */
function ThemeDisplay() {
  const ctx = useContext(AppContext);
  if (!ctx) return <div data-testid="error">no context</div>;
  return (
    <>
      <div data-testid="theme">{ctx.config.theme}</div>
      <div data-testid="relay-count">{ctx.config.relayMetadata.relays.length}</div>
    </>
  );
}

/** Render AppProvider with default props and the ThemeDisplay child */
function renderProvider(overrides: { forcedConfig?: Partial<AppConfig>; storedConfig?: Partial<AppConfig> } = {}) {
  mockStoredConfig = overrides.storedConfig ?? {};
  return render(
    <AppProvider storageKey="test-key" defaultConfig={defaultConfig} forcedConfig={overrides.forcedConfig}>
      <ThemeDisplay />
    </AppProvider>,
  );
}

// --- Tests ---

// Save original matchMedia (defined by setup.ts via Object.defineProperty)
let originalMatchMedia: typeof window.matchMedia;

beforeEach(() => {
  vi.clearAllMocks();
  // Preserve the matchMedia mock from setup.ts so individual tests can
  // temporarily override it and restore afterward
  originalMatchMedia = window.matchMedia;
  document.documentElement.classList.remove('light', 'dark');
});

afterEach(() => {
  document.documentElement.classList.remove('light', 'dark');
  // Restore matchMedia to the setup.ts mock
  window.matchMedia = originalMatchMedia;
});

describe('AppProvider', () => {
  // 1. Provides config to context — child reads it via useContext
  it('provides config to children via context', () => {
    renderProvider();
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    expect(screen.getByTestId('relay-count')).toHaveTextContent('1');
  });

  // 2. Merges defaultConfig with stored config (stored overrides default)
  it('merges stored config over defaultConfig', () => {
    renderProvider({
      storedConfig: { theme: 'light' },
    });
    // Stored theme 'light' overrides default 'dark'
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
  });

  // 3. forcedConfig takes priority over both default and stored
  it('applies forcedConfig over default and stored config', () => {
    renderProvider({
      storedConfig: { theme: 'light' },
      forcedConfig: { theme: 'system' },
    });
    // forcedConfig 'system' wins over stored 'light' and default 'dark'
    expect(screen.getByTestId('theme')).toHaveTextContent('system');
  });

  // 4. updateConfig calls setConfig with the updater function
  it('exposes updateConfig that calls setConfig with an updater function', () => {
    function UpdateButton() {
      const ctx = useContext(AppContext)!;
      return (
        <button
          data-testid="update-btn"
          onClick={() => ctx.updateConfig((prev) => ({ ...prev, theme: 'light' as const }))}
        />
      );
    }

    mockStoredConfig = {};
    render(
      <AppProvider storageKey="test-key" defaultConfig={defaultConfig}>
        <UpdateButton />
      </AppProvider>,
    );

    act(() => {
      screen.getByTestId('update-btn').click();
    });

    // updateConfig forwards the updater function to setConfig
    expect(mockSetConfig).toHaveBeenCalledTimes(1);
    expect(mockSetConfig).toHaveBeenCalledWith(expect.any(Function));

    // Verify the updater logic works correctly
    const updater = mockSetConfig.mock.calls[0][0] as (prev: Partial<AppConfig>) => Partial<AppConfig>;
    const result = updater({ theme: 'dark' });
    expect(result).toEqual({ theme: 'light' });
  });

  // 5. Applies theme class to document root — dark
  it('applies "dark" class to document root when theme is dark', () => {
    renderProvider({ storedConfig: { theme: 'dark' } });
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });

  // 6. Applies theme class to document root — light
  it('applies "light" class to document root when theme is light', () => {
    renderProvider({ storedConfig: { theme: 'light' } });
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  // 7. Applies system theme — dark when media query matches
  it('applies dark class when theme is system and prefers-color-scheme is dark', () => {
    // Override matchMedia for this test to simulate dark preference
    window.matchMedia = (query: string) => ({
      matches: query === '(prefers-color-scheme: dark)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as unknown as MediaQueryList;

    renderProvider({ storedConfig: { theme: 'system' } });

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });

  // 8. Applies system theme — light when media query does not match
  it('applies light class when theme is system and prefers-color-scheme is light', () => {
    // Default matchMedia mock returns matches: false (light preference)
    renderProvider({ storedConfig: { theme: 'system' } });

    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  // 9. Handles system theme media query changes
  it('listens for media query changes when theme is system', () => {
    // Create a real-ish media query mock where we can fire the change handler
    let changeHandler: (() => void) | null = null;
    let currentMatches = false; // starts as light

    const mockMediaQuery = {
      get matches() { return currentMatches; },
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: vi.fn((_event: string, handler: () => void) => {
        changeHandler = handler;
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };

    window.matchMedia = () => mockMediaQuery as unknown as MediaQueryList;

    const { unmount } = renderProvider({ storedConfig: { theme: 'system' } });

    // Initially light
    expect(document.documentElement.classList.contains('light')).toBe(true);

    // Simulate system preference changing to dark
    currentMatches = true;
    act(() => {
      changeHandler?.();
    });

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);

    // Cleanup — listener removed on unmount
    unmount();
    expect(mockMediaQuery.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  // 10. Does not attach media query listener when theme is not system
  it('does not attach media query listener for non-system themes', () => {
    const addEventListenerSpy = vi.fn();
    window.matchMedia = () => ({
      matches: false,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: addEventListenerSpy,
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as unknown as MediaQueryList;

    renderProvider({ storedConfig: { theme: 'dark' } });

    expect(addEventListenerSpy).not.toHaveBeenCalled();
  });

  // 11. Passes storageKey to useLocalStorage
  it('passes storageKey to useLocalStorage', async () => {
    const { useLocalStorage } = await import('@/hooks/useLocalStorage');
    render(
      <AppProvider storageKey="my-custom-key" defaultConfig={defaultConfig}>
        <ThemeDisplay />
      </AppProvider>,
    );
    expect(useLocalStorage).toHaveBeenCalledWith('my-custom-key', {}, expect.any(Object));
  });

  // 12. Removes previous theme class before applying new one
  it('removes previous theme classes before applying new one', () => {
    // Pre-set a theme class
    document.documentElement.classList.add('light');

    renderProvider({ storedConfig: { theme: 'dark' } });

    expect(document.documentElement.classList.contains('light')).toBe(false);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
