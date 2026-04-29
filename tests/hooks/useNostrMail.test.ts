import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNostrMail } from '@/hooks/useNostrMail';

// --- Mocks ---

// Mock nostr-tools/nip59 wrapEvent — returns a plausible gift wrap
vi.mock('nostr-tools/nip59', () => ({
  wrapEvent: vi.fn((event, _sk, recipient) => ({
    id: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    kind: 1059,
    pubkey: 'fake-ephemeral-pubkey',
    created_at: Math.floor(Date.now() / 1000),
    tags: [['p', recipient]],
    content: 'encrypted-gift-wrap-content',
    sig: 'fake-sig',
  })),
}));

// Mock nostr-tools nip19
vi.mock('nostr-tools', () => ({
  nip19: {
    decode: vi.fn((bech32: string) => {
      if (bech32.startsWith('nsec')) {
        return { type: 'nsec', data: new Uint8Array(32).fill(1) };
      }
      // For npub decode (ADMIN_NPUB at module init)
      return { type: 'npub', data: 'fake-admin-hex-pubkey' };
    }),
    npubEncode: vi.fn(() => 'npub1testuser'),
  },
}));

// Mock nostr-tools/pure
vi.mock('nostr-tools/pure', () => ({
  getPublicKey: vi.fn(() => 'fake-user-pubkey'),
  finalizeEvent: vi.fn((event) => ({ ...event, sig: 'fake-auth-sig' })),
}));

// Mock nostr-tools/pool — must be a class (new SimplePool)
vi.mock('nostr-tools/pool', () => {
  return {
    SimplePool: class {
      publish = vi.fn(() => [Promise.resolve()]);
      querySync = vi.fn(() => Promise.resolve([]));
      destroy = vi.fn();
    },
  };
});

// Mock nostr-tools/utils
vi.mock('nostr-tools/utils', () => ({
  normalizeURL: vi.fn((url: string) => url),
}));

// Mock mimetext
vi.mock('mimetext/browser', () => ({
  createMimeMessage: vi.fn(() => {
    const headers: Record<string, string> = {};
    const messages: string[] = [];
    return {
      setSender: vi.fn(({ addr }: { addr: string }) => { headers['From'] = addr; }),
      setRecipient: vi.fn((addr: string) => { headers['To'] = addr; }),
      setBcc: vi.fn(({ addr }: { addr: string }) => { headers['Bcc'] = addr; }),
      setSubject: vi.fn((s: string) => { headers['Subject'] = s; }),
      setHeader: vi.fn((name: string, value: string) => { headers[name] = value; }),
      addMessage: vi.fn(({ data }: { data: string }) => { messages.push(data); }),
      asRaw: vi.fn(() => {
        // Build a simple raw MIME string from captured data
        let raw = '';
        if (headers['From']) raw += `From: ${headers['From']}\n`;
        if (headers['To']) raw += `To: ${headers['To']}\n`;
        if (headers['Bcc']) raw += `Bcc: ${headers['Bcc']}\n`;
        if (headers['Subject']) raw += `Subject: ${headers['Subject']}\n`;
        if (headers['Message-Id']) raw += `Message-Id: ${headers['Message-Id']}\n`;
        raw += '\n';
        raw += messages.join('\n--boundary--\n');
        return raw;
      }),
    };
  }),
}));

// Mock @nostrify/react
vi.mock('@nostrify/react', () => ({
  useNostr: () => ({
    nostr: {
      event: vi.fn(() => Promise.resolve()),
      query: vi.fn(() => Promise.resolve([])),
    },
  }),
}));

// Mock @nostrify/react/login
const mockLogins = [
  { type: 'nsec', data: { nsec: 'nsec1fakekeyfor_testing_purposes_only123456789' } },
];
vi.mock('@nostrify/react/login', () => ({
  useNostrLogin: () => ({ logins: mockLogins }),
}));

// Mock fetch for Resend path
const mockFetch = vi.fn();
global.fetch = mockFetch;

// --- Tests ---

describe('useNostrMail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  const baseReport = {
    title: 'Pothole on Main St',
    type: 'pothole',
    severity: 'high',
    description: 'Big pothole near the bridge',
    location: 'Main St & 1st Ave',
    lat: 39.4,
    lng: -93.9,
    district: 'Richmond',
    reporterName: 'Test Reporter',
  };

  describe('sendReportNotification', () => {
    it('sends report via nostr-mail (default mode)', async () => {
      const { result } = renderHook(() => useNostrMail());

      await act(async () => {
        await result.current.sendReportNotification(baseReport);
      });

      // Should NOT have called fetch (Lambda path)
      expect(mockFetch).not.toHaveBeenCalled();
      // nostr.event should have been called for gift-wrapped events
      // (NPool publish to uid.ovh)
    });

    it('falls back to default email for unknown district', async () => {
      const { result } = renderHook(() => useNostrMail());

      const report = { ...baseReport, district: undefined };
      await act(async () => {
        await result.current.sendReportNotification(report);
      });

      // Should succeed — default email used
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('handles missing nsec login gracefully', async () => {
      // Temporarily clear logins
      const savedLogins = mockLogins.splice(0);
      mockLogins.push({ type: 'extension', data: {} });

      const { result } = renderHook(() => useNostrMail());

      await expect(
        act(async () => {
          await result.current.sendReportNotification(baseReport);
        })
      ).rejects.toThrow('Nostr-mail requires nsec login');

      // Restore
      mockLogins.splice(0);
      savedLogins.forEach(l => mockLogins.push(l));
    });
  });

  describe('sendErrorDM', () => {
    it('sends a gift-wrapped DM to admin on error', async () => {
      const { wrapEvent } = await import('nostr-tools/nip59');
      const { result } = renderHook(() => useNostrMail());

      await act(async () => {
        await result.current.sendErrorDM({
          error: 'Email failed: timeout',
          reportTitle: 'Pothole on Main St',
          reportType: 'pothole',
          severity: 'high',
          reporterName: 'Test Reporter',
          lat: 39.4,
          lng: -93.9,
          district: 'Richmond',
        });
      });

      // wrapEvent should be called for the DM gift wrap (at least 2: recipient + self-copy)
      expect(wrapEvent).toHaveBeenCalled();
      const calls = (wrapEvent as ReturnType<typeof vi.fn>).mock.calls;
      // At least one call should have kind 14 (DM)
      const dmCalls = calls.filter((call: any[]) => call[0]?.kind === 14);
      expect(dmCalls.length).toBeGreaterThanOrEqual(2); // admin + self-copy

      // Check the DM content includes the error
      const dmContent = dmCalls[0][0].content as string;
      expect(dmContent).toContain('Email failed: timeout');
      expect(dmContent).toContain('Pothole on Main St');
      expect(dmContent).toContain('Richmond');
    });

    it('skips DM if no nsec login', async () => {
      const savedLogins = mockLogins.splice(0);
      mockLogins.push({ type: 'extension', data: {} });

      const { wrapEvent } = await import('nostr-tools/nip59');
      const { result } = renderHook(() => useNostrMail());

      await act(async () => {
        await result.current.sendErrorDM({ error: 'test error' });
      });

      expect(wrapEvent).not.toHaveBeenCalled();

      // Restore
      mockLogins.splice(0);
      savedLogins.forEach(l => mockLogins.push(l));
    });

    it('does not throw even if DM fails', async () => {
      const { wrapEvent } = await import('nostr-tools/nip59');
      (wrapEvent as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new Error('wrap failed');
      });

      const { result } = renderHook(() => useNostrMail());

      // Should NOT throw — fire and forget
      await act(async () => {
        await result.current.sendErrorDM({ error: 'test error' });
      });
    });
  });

  describe('BCC', () => {
    it('creates separate BCC MIME with admin email as recipient', async () => {
      const { createMimeMessage } = await import('mimetext/browser');
      const { result } = renderHook(() => useNostrMail());

      await act(async () => {
        await result.current.sendReportNotification(baseReport);
      });

      // createMimeMessage is called multiple times: main email, BCC email
      const calls = (createMimeMessage as ReturnType<typeof vi.fn>).mock.results;
      expect(calls.length).toBeGreaterThanOrEqual(2); // main + BCC
    });

    it('gift-wraps BCC event for bridge delivery', async () => {
      const { wrapEvent } = await import('nostr-tools/nip59');
      const { result } = renderHook(() => useNostrMail());

      await act(async () => {
        await result.current.sendReportNotification(baseReport);
      });

      const calls = (wrapEvent as ReturnType<typeof vi.fn>).mock.calls;
      // Should have: main bridge event + self-copy + BCC event = 3 kind 1301 wraps
      const kind1301Calls = calls.filter((call: any[]) => call[0]?.kind === 1301);
      expect(kind1301Calls.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('mailMode', () => {
    it('returns nostr as default mail mode', () => {
      const { result } = renderHook(() => useNostrMail());
      expect(result.current.mailMode).toBe('nostr');
    });
  });
});
