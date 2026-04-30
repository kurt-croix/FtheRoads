import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handler } from '../../iac/lambda/send-email.mjs';

// Mock fetch for Resend API
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('send-email Lambda handler', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    process.env.RESEND_API_KEY = 'test-api-key';
  });

  it('rejects non-POST methods', async () => {
    const result = await handler({ httpMethod: 'GET' });
    expect(result.statusCode).toBe(405);
  });

  it('rejects requests with missing fields', async () => {
    const result = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ to: 'test@test.com' }),
    });
    expect(result.statusCode).toBe(400);
  });

  it('rejects requests with no API key', async () => {
    delete process.env.RESEND_API_KEY;
    const result = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ to: 'test@test.com', subject: 'Test', text: 'Test' }),
    });
    expect(result.statusCode).toBe(500);
  });

  it('sends email and returns success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'email-123' }),
    });

    const result = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ to: 'official@gov.com', subject: '[FtheRoads] Test', text: 'Test email' }),
    });

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.id).toBe('email-123');

    // Verify fetch was called with correct params
    expect(mockFetch).toHaveBeenCalledWith('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-api-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'FtheRoads <reports@ftheroads.com>',
        to: ['official@gov.com'],
        subject: '[FtheRoads] Test',
        text: 'Test email',
        html: 'Test email',
      }),
    });
  });

  it('includes bcc in Resend payload when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'bcc-email-456' }),
    });

    const result = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({
        to: 'official@gov.com',
        subject: '[FtheRoads] BCC Test',
        text: 'BCC content',
        bcc: 'admin@ftheroads.com',
      }),
    });

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.id).toBe('bcc-email-456');

    // Verify the Resend payload includes bcc
    expect(mockFetch).toHaveBeenCalledWith('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-api-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'FtheRoads <reports@ftheroads.com>',
        to: ['official@gov.com'],
        subject: '[FtheRoads] BCC Test',
        text: 'BCC content',
        html: 'BCC content',
        bcc: ['admin@ftheroads.com'],
      }),
    });
  });

  it('handles Resend API errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ error: { message: 'Invalid email' } }),
    });

    const result = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ to: 'bad', subject: 'Test', text: 'Test' }),
    });

    expect(result.statusCode).toBe(422);
  });
});
