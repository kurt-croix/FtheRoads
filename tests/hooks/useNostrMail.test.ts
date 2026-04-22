import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useNostrMail } from '@/hooks/useNostrMail';

// Mock the Nostr login hook
vi.mock('@nostrify/react/login', () => ({
  useNostrLogin: () => ({
    logins: [{ type: 'nsec', data: { nsec: 'nsec1fakekeyfor_testing_purposes_only123456789' } }],
  }),
}));

// Mock nostr-tools nip19
vi.mock('nostr-tools', () => ({
  nip19: {
    decode: vi.fn(() => ({ type: 'nsec', data: new Uint8Array(32) })),
    npubEncode: vi.fn(() => 'npub1test'),
  },
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('useNostrMail', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('sends email via Lambda with district email mapping', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, id: 'email-123' }),
    });

    const { result } = renderHook(() => useNostrMail());

    await result.current.sendReportNotification({
      title: 'Pothole on Main St',
      type: 'pothole',
      severity: 'high',
      description: 'Big pothole near the bridge',
      location: 'Main St & 1st Ave',
      lat: 39.4,
      lng: -93.9,
      district: 'Richmond',
      reporterNpub: 'npub1test',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('lambda-url'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const call = mockFetch.mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.to).toBe('Croix4CLERK@pm.me');
    expect(body.subject).toContain('HIGH');
    expect(body.subject).toContain('Pothole on Main St');
    expect(body.text).toContain('Richmond');
    expect(body.text).toContain('39.4');
  });

  it('falls back to default email for unknown district', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, id: 'email-456' }),
    });

    const { result } = renderHook(() => useNostrMail());

    await result.current.sendReportNotification({
      title: 'Test',
      type: 'other',
      severity: 'low',
      description: 'Test',
      location: '',
      lat: 39.4,
      lng: -93.9,
      reporterNpub: 'npub1test',
    });

    const call = mockFetch.mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.to).toBe('croix4clerk@pm.me'); // DEFAULT_NOTIFICATION_EMAIL
  });

  it('throws on Lambda error response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => '{"Message":"Forbidden"}',
    });

    const { result } = renderHook(() => useNostrMail());

    await expect(
      result.current.sendReportNotification({
        title: 'Test',
        type: 'pothole',
        severity: 'low',
        description: 'Test',
        location: '',
        lat: 0,
        lng: 0,
        reporterNpub: 'npub1test',
      })
    ).rejects.toThrow('Email failed: 403');
  });

  it('includes all report fields in the email body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, id: 'email-789' }),
    });

    const { result } = renderHook(() => useNostrMail());

    await result.current.sendReportNotification({
      title: 'Flooding on Hwy 10',
      type: 'flooding',
      severity: 'critical',
      description: 'Road completely underwater',
      location: 'Highway 10 near Camden',
      lat: 39.2,
      lng: -94.1,
      district: 'Camden',
      reporterNpub: 'npub1test',
    });

    const call = mockFetch.mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.text).toContain('Title: Flooding on Hwy 10');
    expect(body.text).toContain('Type: flooding');
    expect(body.text).toContain('Severity: critical');
    expect(body.text).toContain('Location: Highway 10 near Camden');
    expect(body.text).toContain('Coordinates: 39.2, -94.1');
    expect(body.text).toContain('District: Camden');
    expect(body.text).toContain('Reporter: npub1test');
    expect(body.text).toContain('Road completely underwater');
    expect(body.text).toContain('ftheroads.com/?lat=39.2');
  });
});
