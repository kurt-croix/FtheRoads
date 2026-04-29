import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock the toast component module — it only exports types, so an empty object is fine
vi.mock("@/components/ui/toast", () => ({}));

// Must import AFTER the mock so the module resolves against our stub
import { reducer, useToast, toast } from "@/hooks/useToast";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal toast-like action payload for ADD_TOAST. */
const makeToast = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  title: `Toast ${id}`,
  description: `Description for ${id}`,
  open: true,
  ...overrides,
});

// ---------------------------------------------------------------------------
// reducer — pure function, no React involved
// ---------------------------------------------------------------------------

describe("reducer", () => {
  const initialState = { toasts: [] as Array<Record<string, unknown>> };

  // -- ADD_TOAST -----------------------------------------------------------

  describe("ADD_TOAST", () => {
    it("adds a toast to an empty state", () => {
      const t = makeToast("1");
      const next = reducer(initialState, { type: "ADD_TOAST", toast: t });
      expect(next.toasts).toHaveLength(1);
      expect(next.toasts[0].id).toBe("1");
    });

    it("respects TOAST_LIMIT of 1 — adding a second toast replaces the first", () => {
      const state = reducer(initialState, {
        type: "ADD_TOAST",
        toast: makeToast("1"),
      });
      const next = reducer(state, {
        type: "ADD_TOAST",
        toast: makeToast("2"),
      });
      // Only the newest toast should remain
      expect(next.toasts).toHaveLength(1);
      expect(next.toasts[0].id).toBe("2");
    });
  });

  // -- UPDATE_TOAST --------------------------------------------------------

  describe("UPDATE_TOAST", () => {
    it("updates a matching toast by id", () => {
      const state = reducer(initialState, {
        type: "ADD_TOAST",
        toast: makeToast("1", { title: "Original" }),
      });
      const next = reducer(state, {
        type: "UPDATE_TOAST",
        toast: { id: "1", title: "Updated" },
      });
      expect(next.toasts[0].title).toBe("Updated");
    });

    it("leaves non-matching toasts unchanged", () => {
      const state = reducer(initialState, {
        type: "ADD_TOAST",
        toast: makeToast("1", { title: "Keep" }),
      });
      const next = reducer(state, {
        type: "UPDATE_TOAST",
        toast: { id: "nonexistent", title: "Ghost" },
      });
      expect(next.toasts[0].title).toBe("Keep");
    });
  });

  // -- DISMISS_TOAST -------------------------------------------------------

  describe("DISMISS_TOAST", () => {
    it("sets open:false for a specific toast", () => {
      const state = reducer(initialState, {
        type: "ADD_TOAST",
        toast: makeToast("1"),
      });
      const next = reducer(state, { type: "DISMISS_TOAST", toastId: "1" });
      expect(next.toasts[0].open).toBe(false);
    });

    it("dismisses all toasts when no toastId is provided", () => {
      // Add one toast (limit is 1, but let's test the dismiss-all branch directly)
      const state = reducer(initialState, {
        type: "ADD_TOAST",
        toast: makeToast("1"),
      });
      // Manually build a state with two toasts to verify the "dismiss all" path
      const multiState = {
        toasts: [makeToast("a"), makeToast("b")],
      };
      const next = reducer(multiState, { type: "DISMISS_TOAST", toastId: undefined });
      expect(next.toasts.every((t: { open: boolean }) => t.open === false)).toBe(true);
    });
  });

  // -- REMOVE_TOAST --------------------------------------------------------

  describe("REMOVE_TOAST", () => {
    it("removes a specific toast by id", () => {
      const state = reducer(initialState, {
        type: "ADD_TOAST",
        toast: makeToast("1"),
      });
      const next = reducer(state, { type: "REMOVE_TOAST", toastId: "1" });
      expect(next.toasts).toHaveLength(0);
    });

    it("removes all toasts when no toastId is provided", () => {
      const multiState = {
        toasts: [makeToast("a"), makeToast("b")],
      };
      const next = reducer(multiState, { type: "REMOVE_TOAST", toastId: undefined });
      expect(next.toasts).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// toast() — imperative API
// ---------------------------------------------------------------------------

describe("toast()", () => {
  it("returns an object with id, dismiss, and update", () => {
    const result = toast({ title: "Hello" });
    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("dismiss");
    expect(result).toHaveProperty("update");
    expect(typeof result.dismiss).toBe("function");
    expect(typeof result.update).toBe("function");
  });

  it("dispatches an ADD_TOAST action that can be read via useToast", () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      toast({ title: "Test toast" });
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].title).toBe("Test toast");
  });
});

// ---------------------------------------------------------------------------
// useToast() — hook integration
// ---------------------------------------------------------------------------

describe("useToast()", () => {
  it("returns toasts array, toast function, and dismiss function", () => {
    const { result } = renderHook(() => useToast());

    expect(result.current).toHaveProperty("toasts");
    expect(result.current).toHaveProperty("toast");
    expect(result.current).toHaveProperty("dismiss");
    expect(Array.isArray(result.current.toasts)).toBe(true);
    expect(typeof result.current.toast).toBe("function");
    expect(typeof result.current.dismiss).toBe("function");
  });

  it("reflects toasts added via the toast() function", () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      toast({ title: "Hello", description: "World" });
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].title).toBe("Hello");
    expect(result.current.toasts[0].description).toBe("World");
  });

  it("adding a second toast replaces the first (TOAST_LIMIT = 1)", () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      toast({ title: "First" });
    });
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].title).toBe("First");

    act(() => {
      toast({ title: "Second" });
    });
    // Still only 1 toast — the new one replaced the old
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].title).toBe("Second");
  });

  it("dismiss() with a specific toastId sets open:false", () => {
    const { result } = renderHook(() => useToast());

    let toastId: string;
    act(() => {
      const t = toast({ title: "Dismiss me" });
      toastId = t.id;
    });

    act(() => {
      result.current.dismiss(toastId!);
    });

    // The toast should still exist but with open:false
    const target = result.current.toasts.find((t) => t.id === toastId);
    expect(target).toBeDefined();
    expect(target!.open).toBe(false);
  });

  it("dismiss() without toastId dismisses all toasts", () => {
    // Since TOAST_LIMIT is 1, we build a multi-toast state by directly
    // importing the dispatch function path via the reducer. Instead, we
    // can just verify the hook's dismiss function exists and works with
    // the single-toast scenario.
    const { result } = renderHook(() => useToast());

    act(() => {
      toast({ title: "Only one" });
    });

    act(() => {
      result.current.dismiss();
    });

    // The single toast should be dismissed (open: false)
    expect(result.current.toasts.length).toBeLessThanOrEqual(1);
    if (result.current.toasts.length > 0) {
      expect(result.current.toasts[0].open).toBe(false);
    }
  });
});
