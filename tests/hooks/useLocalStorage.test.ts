import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLocalStorage } from '@/hooks/useLocalStorage';

describe('useLocalStorage', () => {
  // Spies we create per-test; cleaned up here
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  // --- 1. Returns default value when localStorage empty ---

  it('returns the default value when localStorage is empty', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 'default'));
    const [value] = result.current;
    expect(value).toBe('default');
  });

  // --- 2. Returns stored value when localStorage has data ---

  it('returns the stored value when localStorage already has data for the key', () => {
    localStorage.setItem('existing-key', JSON.stringify('stored'));
    const { result } = renderHook(() => useLocalStorage('existing-key', 'default'));
    const [value] = result.current;
    expect(value).toBe('stored');
  });

  // --- 3. setValue updates state and localStorage ---

  it('setValue updates both state and localStorage', () => {
    const { result } = renderHook(() => useLocalStorage('set-key', 'initial'));

    act(() => {
      result.current[1]('updated');
    });

    expect(result.current[0]).toBe('updated');
    expect(localStorage.getItem('set-key')).toBe('"updated"');
  });

  // --- 4. setValue with function updater ---

  it('setValue accepts a function updater that receives the previous value', () => {
    const { result } = renderHook(() => useLocalStorage('fn-key', 0));

    act(() => {
      result.current[1]((prev) => prev + 1);
    });

    expect(result.current[0]).toBe(1);
    expect(localStorage.getItem('fn-key')).toBe('1');

    // Chain another update to confirm prev-value threading
    act(() => {
      result.current[1]((prev) => prev + 5);
    });

    expect(result.current[0]).toBe(6);
    expect(localStorage.getItem('fn-key')).toBe('6');
  });

  // --- 5. Cross-tab sync via storage event ---

  it('syncs state when a storage event fires for the same key', () => {
    const { result } = renderHook(() => useLocalStorage('sync-key', 'initial'));

    act(() => {
      // Simulate another tab writing to localStorage
      const event = new StorageEvent('storage', {
        key: 'sync-key',
        newValue: '"from-another-tab"',
        storageArea: localStorage,
      });
      window.dispatchEvent(event);
    });

    expect(result.current[0]).toBe('from-another-tab');
  });

  // --- 6. Custom serializer support ---

  it('uses a custom serializer when provided', () => {
    // Serializer that reverses strings
    const serializer = {
      serialize: (value: string) => value.split('').reverse().join(''),
      deserialize: (value: string) => value.split('').reverse().join(''),
    };

    localStorage.setItem('custom-key', serializer.serialize('hello'));
    const { result } = renderHook(() =>
      useLocalStorage('custom-key', 'default', serializer),
    );

    const [value] = result.current;
    expect(value).toBe('hello');

    // Writing should also use the custom serializer
    act(() => {
      result.current[1]('world');
    });

    expect(result.current[0]).toBe('world');
    // Raw localStorage should contain the reversed string
    expect(localStorage.getItem('custom-key')).toBe('dlrow');
  });

  // --- 7. Handles localStorage errors gracefully (getItem throws) ---

  it('returns the default value when localStorage.getItem throws', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('getItem broken');
    });

    const { result } = renderHook(() =>
      useLocalStorage('error-key', 'fallback'),
    );

    const [value] = result.current;
    expect(value).toBe('fallback');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('error-key'),
      expect.any(Error),
    );
  });

  // --- 8. Handles localStorage setItem errors gracefully ---

  it('does not throw when localStorage.setItem throws', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('setItem broken');
    });

    const { result } = renderHook(() =>
      useLocalStorage('set-error-key', 'initial'),
    );

    // Should not throw — error is caught internally
    act(() => {
      result.current[1]('new-value');
    });

    // State still updates even though localStorage failed
    expect(result.current[0]).toBe('new-value');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('set-error-key'),
      expect.any(Error),
    );
  });

  // --- 9. Ignores storage events for different keys ---

  it('ignores storage events for a different key', () => {
    const { result } = renderHook(() => useLocalStorage('my-key', 'initial'));

    act(() => {
      const event = new StorageEvent('storage', {
        key: 'other-key',
        newValue: '"should-not-apply"',
        storageArea: localStorage,
      });
      window.dispatchEvent(event);
    });

    // Value should remain unchanged
    expect(result.current[0]).toBe('initial');
  });

  // --- 10. Ignores storage events with null newValue ---

  it('ignores storage events with null newValue (item removed)', () => {
    const { result } = renderHook(() =>
      useLocalStorage('null-key', 'initial'),
    );

    act(() => {
      const event = new StorageEvent('storage', {
        key: 'null-key',
        newValue: null,
        storageArea: localStorage,
      });
      window.dispatchEvent(event);
    });

    // Value should remain unchanged — null means the item was removed
    expect(result.current[0]).toBe('initial');
  });

  // --- Bonus: handles deserialization errors in storage event listener ---

  it('does not crash when the storage event carries unparseable JSON', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() =>
      useLocalStorage('bad-json-key', 'initial'),
    );

    act(() => {
      const event = new StorageEvent('storage', {
        key: 'bad-json-key',
        newValue: '{not valid json}',
        storageArea: localStorage,
      });
      window.dispatchEvent(event);
    });

    // State should remain unchanged — the error is caught
    expect(result.current[0]).toBe('initial');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('bad-json-key'),
      expect.any(Error),
    );
  });
});
