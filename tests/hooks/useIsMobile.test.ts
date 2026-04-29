import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIsMobile } from "@/hooks/useIsMobile";

// References captured from the mock MediaQueryList created during render
let changeListener: (() => void) | null = null;
let addSpy: ReturnType<typeof vi.fn> | null = null;
let removeSpy: ReturnType<typeof vi.fn> | null = null;

/**
 * Helper: set up window.innerWidth and window.matchMedia mocks.
 * Must be called before each test (or when switching viewport size).
 */
function mockViewport(width: number): void {
  // Override innerWidth via Object.defineProperty (jsdom doesn't truly resize)
  Object.defineProperty(window, "innerWidth", {
    writable: true,
    configurable: true,
    value: width,
  });

  // Reset captured references
  changeListener = null;
  addSpy = null;
  removeSpy = null;

  // Re-apply matchMedia mock so it returns a fresh MediaQueryList for the new width
  window.matchMedia = vi.fn().mockImplementation((query: string) => {
    // Create fresh spies for each matchMedia call so captures are accurate
    const _addSpy = vi.fn((_event: string, handler: () => void) => {
      changeListener = handler;
    });
    const _removeSpy = vi.fn();

    // Expose them on the module-level variables for assertions
    addSpy = _addSpy;
    removeSpy = _removeSpy;

    return {
      matches: width < 768,
      media: query,
      onchange: null,
      addListener: vi.fn(),    // deprecated but some codepaths check it
      removeListener: vi.fn(), // deprecated
      addEventListener: _addSpy,
      removeEventListener: _removeSpy,
      dispatchEvent: vi.fn(),
    };
  });
}

describe("useIsMobile", () => {
  beforeEach(() => {
    mockViewport(500); // default to mobile width
  });

  afterEach(() => {
    vi.restoreAllMocks();
    changeListener = null;
  });

  // --- 1. Returns true when window.innerWidth < 768 ---

  it("returns true when viewport is narrower than 768px", () => {
    mockViewport(320);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("returns true at 767px (one pixel below breakpoint)", () => {
    mockViewport(767);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  // --- 2. Returns false when window.innerWidth >= 768 ---

  it("returns false when viewport is exactly 768px", () => {
    mockViewport(768);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("returns false when viewport is wider than 768px", () => {
    mockViewport(1200);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  // --- 3. Updates when matchMedia fires change event (resize simulation) ---

  it("updates from mobile to desktop when viewport crosses the breakpoint", () => {
    mockViewport(500);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);

    // Simulate resizing the browser window to a desktop width
    act(() => {
      Object.defineProperty(window, "innerWidth", {
        writable: true,
        configurable: true,
        value: 1024,
      });
      // Fire the captured change listener (as the browser would on resize)
      changeListener?.();
    });

    expect(result.current).toBe(false);
  });

  it("updates from desktop to mobile when viewport shrinks below breakpoint", () => {
    mockViewport(1024);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => {
      Object.defineProperty(window, "innerWidth", {
        writable: true,
        configurable: true,
        value: 400,
      });
      changeListener?.();
    });

    expect(result.current).toBe(true);
  });

  // --- 4. Cleanup removes event listener on unmount ---

  it("removes the matchMedia listener when the hook unmounts", () => {
    mockViewport(500);
    const { unmount } = renderHook(() => useIsMobile());

    // addEventListener should have been called during the effect
    expect(addSpy).toHaveBeenCalledWith("change", expect.any(Function));

    unmount();

    // After unmount, the cleanup function should call removeEventListener
    expect(removeSpy).toHaveBeenCalledWith("change", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledTimes(1);
  });
});
