import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import type { NWCConnection } from "@/hooks/useNWC";

// --- Mocks ---

// Internal state backing the useLocalStorage mock
let mockConnections: NWCConnection[] = [];
let mockActiveConnection: string | null = null;

vi.mock("@/hooks/useLocalStorage", () => ({
  useLocalStorage: vi.fn((_key: string, defaultValue: unknown) => {
    if (_key === "nwc-connections") {
      return [
        mockConnections,
        (val: unknown) => {
          mockConnections =
            typeof val === "function" ? val(mockConnections) : val;
        },
      ];
    }
    if (_key === "nwc-active-connection") {
      return [
        mockActiveConnection,
        (val: unknown) => {
          mockActiveConnection =
            typeof val === "function" ? val(mockActiveConnection) : val;
        },
      ];
    }
    return [defaultValue, vi.fn()];
  }),
}));

const mockToast = vi.fn();
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockPay = vi.fn();
vi.mock("@getalby/sdk", () => ({
  LN: vi.fn(function (this: unknown, _connectionString: string) {
    return { pay: mockPay };
  }),
}));

// Import after mocks are registered
import { useNWCInternal } from "@/hooks/useNWC";
import { LN } from "@getalby/sdk";

// --- Helpers ---

/** Valid NWC URI for testing */
const VALID_URI = "nostr+walletconnect://abc123?relay=wss://relay.example.com";
const VALID_URI_ALT =
  "nostr+walletconnect://def456?relay=wss://relay.example.com";

// --- Tests ---

describe("useNWCInternal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset backing state for useLocalStorage mock
    mockConnections = [];
    mockActiveConnection = null;
  });

  // ------------------------------------------------------------------
  // addConnection — rejects invalid URI
  // ------------------------------------------------------------------
  it("addConnection rejects invalid URI (no nostr+walletconnect:// prefix)", async () => {
    const { result } = renderHook(() => useNWCInternal());

    let success: boolean;
    await act(async () => {
      success = await result.current.addConnection("https://example.com");
    });

    expect(success!).toBe(false);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Invalid NWC URI" }),
    );
    expect(mockConnections).toHaveLength(0);
  });

  // ------------------------------------------------------------------
  // addConnection — rejects duplicate
  // ------------------------------------------------------------------
  it("addConnection rejects duplicate connection", async () => {
    // Seed an existing connection in state
    mockConnections = [
      { connectionString: VALID_URI, alias: "Existing", isConnected: true },
    ];

    const { result } = renderHook(() => useNWCInternal());

    let success: boolean;
    await act(async () => {
      success = await result.current.addConnection(VALID_URI, "Duplicate");
    });

    expect(success!).toBe(false);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Connection already exists" }),
    );
    expect(mockConnections).toHaveLength(1);
  });

  // ------------------------------------------------------------------
  // addConnection — adds valid connection with correct alias
  // ------------------------------------------------------------------
  it("addConnection adds valid connection with correct alias", async () => {
    const { result } = renderHook(() => useNWCInternal());

    let success: boolean;
    await act(async () => {
      success = await result.current.addConnection(VALID_URI, "My Wallet");
    });

    expect(success!).toBe(true);
    expect(mockConnections).toHaveLength(1);
    expect(mockConnections[0].connectionString).toBe(VALID_URI);
    expect(mockConnections[0].alias).toBe("My Wallet");
    expect(mockConnections[0].isConnected).toBe(true);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Wallet connected" }),
    );
  });

  // ------------------------------------------------------------------
  // addConnection — sets active when first connection
  // ------------------------------------------------------------------
  it("addConnection sets active when first connection", async () => {
    const { result } = renderHook(() => useNWCInternal());

    await act(async () => {
      await result.current.addConnection(VALID_URI, "First");
    });

    expect(mockActiveConnection).toBe(VALID_URI);
  });

  // ------------------------------------------------------------------
  // removeConnection — removes from list
  // ------------------------------------------------------------------
  it("removeConnection removes from list", () => {
    mockConnections = [
      { connectionString: VALID_URI, alias: "Wallet 1", isConnected: true },
      {
        connectionString: VALID_URI_ALT,
        alias: "Wallet 2",
        isConnected: true,
      },
    ];
    mockActiveConnection = VALID_URI;

    const { result } = renderHook(() => useNWCInternal());

    act(() => {
      result.current.removeConnection(VALID_URI);
    });

    expect(mockConnections).toHaveLength(1);
    expect(mockConnections[0].connectionString).toBe(VALID_URI_ALT);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Wallet disconnected" }),
    );
  });

  // ------------------------------------------------------------------
  // removeConnection — switches active to remaining connection
  // ------------------------------------------------------------------
  it("removeConnection switches active to remaining connection", () => {
    mockConnections = [
      { connectionString: VALID_URI, alias: "Wallet 1", isConnected: true },
      {
        connectionString: VALID_URI_ALT,
        alias: "Wallet 2",
        isConnected: true,
      },
    ];
    mockActiveConnection = VALID_URI;

    const { result } = renderHook(() => useNWCInternal());

    act(() => {
      result.current.removeConnection(VALID_URI);
    });

    // Active should switch to the remaining connection
    expect(mockActiveConnection).toBe(VALID_URI_ALT);
  });

  // ------------------------------------------------------------------
  // removeConnection — clears active when no connections left
  // ------------------------------------------------------------------
  it("removeConnection clears active when no connections left", () => {
    mockConnections = [
      { connectionString: VALID_URI, alias: "Only Wallet", isConnected: true },
    ];
    mockActiveConnection = VALID_URI;

    const { result } = renderHook(() => useNWCInternal());

    act(() => {
      result.current.removeConnection(VALID_URI);
    });

    expect(mockConnections).toHaveLength(0);
    expect(mockActiveConnection).toBeNull();
  });

  // ------------------------------------------------------------------
  // getActiveConnection — returns null when no connections
  // ------------------------------------------------------------------
  it("getActiveConnection returns null when no connections", () => {
    const { result } = renderHook(() => useNWCInternal());

    let active: NWCConnection | null;
    act(() => {
      active = result.current.getActiveConnection();
    });

    expect(active!).toBeNull();
  });

  // ------------------------------------------------------------------
  // getActiveConnection — returns active connection
  // ------------------------------------------------------------------
  it("getActiveConnection returns active connection", () => {
    const conn: NWCConnection = {
      connectionString: VALID_URI,
      alias: "Active Wallet",
      isConnected: true,
    };
    mockConnections = [conn];
    mockActiveConnection = VALID_URI;

    const { result } = renderHook(() => useNWCInternal());

    let active: NWCConnection | null;
    act(() => {
      active = result.current.getActiveConnection();
    });

    expect(active!).toEqual(conn);
  });

  // ------------------------------------------------------------------
  // sendPayment — creates LN client and calls pay
  // ------------------------------------------------------------------
  it("sendPayment creates LN client and calls pay", async () => {
    mockPay.mockResolvedValueOnce({ preimage: "abc123preimage" });

    const connection: NWCConnection = {
      connectionString: VALID_URI,
      alias: "Pay Wallet",
      isConnected: true,
    };

    const { result } = renderHook(() => useNWCInternal());

    let response: { preimage: string };
    await act(async () => {
      response = await result.current.sendPayment(
        connection,
        "lnbc1000n1invoice",
      );
    });

    // LN constructor should have been called with the connection string
    expect(LN).toHaveBeenCalledWith(VALID_URI);
    // pay should have been called with the invoice
    expect(mockPay).toHaveBeenCalledWith("lnbc1000n1invoice");
    // Response should contain the preimage from the mock
    expect(response!).toEqual({ preimage: "abc123preimage" });
  });
});
