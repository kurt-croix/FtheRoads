import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Force Lambda-only mode before importing the module under test,
// since MAIL_MODE is evaluated at import time from env vars.
vi.stubEnv('VITE_MAIL_MODE', 'resend');
vi.stubEnv('VITE_LAMBDA_URL', 'https://lambda-url.example.com/send-email');

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

// Mock nostr-mail SDK — returns a class constructor so `new NostrMailClient()` works
vi.mock('nostr-mail', () => {
  return {
    NostrMailClient: class {
      sendEmail = vi.fn().mockResolvedValue(undefined);
      close = vi.fn().mockResolvedValue(undefined);
    },
  };
});

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
      reporterName: 'Test Reporter',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://lambda-url.example.com/send-email',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const call = mockFetch.mock.calls[0];
    const body = JSON.parse(call[1].body);
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
      reporterName: 'Test Reporter',
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
        reporterName: 'Test Reporter',
      })
    ).rejects.toThrow('Email failed: 403');
  });

  it('includes report fields in the email body', async () => {
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
      reporterName: 'Test Reporter',
    });

    const call = mockFetch.mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.text).toContain('Flooding');
    expect(body.text).toContain('CRITICAL');
    expect(body.text).toContain('Road completely underwater');
    expect(body.text).toContain('ftheroads.com/?lat=39.2');
  });
});
