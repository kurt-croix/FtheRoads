import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import React from "react";

// --- Mock ---

// Mock AppContext; the factory runs before everything else due to hoisting,
// so we inline the value instead of referencing a top-level variable.
vi.mock("@/contexts/AppContext", () => {
  return {
    AppContext: React.createContext(undefined),
  };
});

// Import after mock setup
import { AppContext } from "@/contexts/AppContext";
import { useAppContext } from "@/hooks/useAppContext";

// Build a mock value matching AppContextType shape (used inside tests)
function makeMockContextValue() {
  return {
    config: {
      theme: "light" as const,
      relayMetadata: { relays: [], updatedAt: 0 },
    },
    updateConfig: vi.fn(),
  };
}

// --- Tests ---

describe("useAppContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns context value when used within a provider", () => {
    const mockValue = makeMockContextValue();
    const { result } = renderHook(() => useAppContext(), {
      wrapper: ({ children }) => (
        <AppContext.Provider value={mockValue}>
          {children}
        </AppContext.Provider>
      ),
    });

    expect(result.current).toBe(mockValue);
    expect(result.current.config.theme).toBe("light");
    expect(result.current.updateConfig).toBe(mockValue.updateConfig);
  });

  it("throws error when used outside a provider", () => {
    // The mocked AppContext has `undefined` as its default value.
    // Rendering the hook without a wrapper means useContext returns undefined,
    // which triggers the guard clause in the hook.
    // renderHook propagates errors thrown during render, so we catch it here.
    expect(() => renderHook(() => useAppContext())).toThrow(
      "useAppContext must be used within an AppProvider"
    );
  });
});
