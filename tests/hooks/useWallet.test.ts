import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { WebLNProvider } from "@webbtc/webln-types";

// --- Mocks ---

const mockGetActiveConnection = vi.fn(() => null);
const mockUseNWC = vi.fn(() => ({
  connections: [] as Array<{ isConnected: boolean }>,
  getActiveConnection: mockGetActiveConnection,
}));

vi.mock("@/hooks/useNWCContext", () => ({
  useNWC: (...args: unknown[]) => mockUseNWC(...args),
}));

// Import after mock setup so the module resolves against our stub
import { useWallet } from "@/hooks/useWallet";

// --- Helpers ---

/** Minimal fake WebLNProvider for testing */
function createMockWebln(): WebLNProvider {
  return {
    enable: vi.fn(),
    getInfo: vi.fn(),
    sendPayment: vi.fn(),
    makeInvoice: vi.fn(),
    signMessage: vi.fn(),
    verifyMessage: vi.fn(),
    getBalance: vi.fn(),
  } as unknown as WebLNProvider;
}

// Store original globalThis.webln so we can restore it after each test
let originalWebln: WebLNProvider | undefined;

// --- Tests ---

describe("useWallet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Save and clear globalThis.webln
    originalWebln = (globalThis as { webln?: WebLNProvider }).webln;
    delete (globalThis as { webln?: WebLNProvider }).webln;
    // Reset useNWC mock to defaults (no connections, no active connection)
    mockUseNWC.mockReturnValue({
      connections: [],
      getActiveConnection: vi.fn(() => null),
    });
  });

  afterEach(() => {
    // Restore original globalThis.webln
    if (originalWebln !== undefined) {
      (globalThis as { webln?: WebLNProvider }).webln = originalWebln;
    } else {
      delete (globalThis as { webln?: WebLNProvider }).webln;
    }
  });

  it("returns manual when no NWC or webln", () => {
    const { result } = renderHook(() => useWallet());

    expect(result.current.hasNWC).toBe(false);
    expect(result.current.webln).toBeNull();
    expect(result.current.activeNWC).toBeNull();
    expect(result.current.preferredMethod).toBe("manual");
  });

  it("returns nwc when active NWC connection exists", () => {
    const activeConnection = { id: "conn-1", isConnected: true };
    mockUseNWC.mockReturnValue({
      connections: [{ isConnected: true }],
      getActiveConnection: vi.fn(() => activeConnection),
    });

    const { result } = renderHook(() => useWallet());

    expect(result.current.hasNWC).toBe(true);
    expect(result.current.activeNWC).toBe(activeConnection);
    expect(result.current.preferredMethod).toBe("nwc");
  });

  it("returns webln when webln global exists but no NWC", () => {
    const fakeWebln = createMockWebln();
    (globalThis as { webln?: WebLNProvider }).webln = fakeWebln;

    const { result } = renderHook(() => useWallet());

    expect(result.current.webln).toBe(fakeWebln);
    expect(result.current.activeNWC).toBeNull();
    expect(result.current.preferredMethod).toBe("webln");
  });

  it("hasNWC is true when connections exist with isConnected=true", () => {
    mockUseNWC.mockReturnValue({
      connections: [{ isConnected: true }, { isConnected: false }],
      getActiveConnection: vi.fn(() => null),
    });

    const { result } = renderHook(() => useWallet());

    expect(result.current.hasNWC).toBe(true);
  });

  it("hasNWC is false when connections are empty", () => {
    mockUseNWC.mockReturnValue({
      connections: [],
      getActiveConnection: vi.fn(() => null),
    });

    const { result } = renderHook(() => useWallet());

    expect(result.current.hasNWC).toBe(false);
  });

  it("hasNWC is false when all connections are disconnected", () => {
    mockUseNWC.mockReturnValue({
      connections: [{ isConnected: false }, { isConnected: false }],
      getActiveConnection: vi.fn(() => null),
    });

    const { result } = renderHook(() => useWallet());

    expect(result.current.hasNWC).toBe(false);
  });

  it("preferredMethod is nwc over webln (NWC takes priority)", () => {
    // Both webln global and active NWC connection are present
    const fakeWebln = createMockWebln();
    (globalThis as { webln?: WebLNProvider }).webln = fakeWebln;

    const activeConnection = { id: "conn-1", isConnected: true };
    mockUseNWC.mockReturnValue({
      connections: [{ isConnected: true }],
      getActiveConnection: vi.fn(() => activeConnection),
    });

    const { result } = renderHook(() => useWallet());

    // NWC should win over webln
    expect(result.current.preferredMethod).toBe("nwc");
    expect(result.current.webln).toBe(fakeWebln);
    expect(result.current.activeNWC).toBe(activeConnection);
  });
});
