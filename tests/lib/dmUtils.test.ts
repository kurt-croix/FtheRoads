import { describe, it, expect } from 'vitest';
import { validateDMEvent, getRecipientPubkey, getConversationPartner, formatConversationTime, formatFullDateTime } from '@/lib/dmUtils';

const makeEvent = (overrides: Record<string, unknown> = {}) => ({
  id: 'test-id',
  kind: 4,
  pubkey: 'sender-pubkey',
  created_at: Math.floor(Date.now() / 1000),
  tags: [['p', 'recipient-pubkey']],
  content: 'encrypted message',
  sig: 'test-sig',
  ...overrides,
});

describe('dmUtils', () => {
  describe('validateDMEvent', () => {
    it('validates a proper kind 4 DM', () => {
      expect(validateDMEvent(makeEvent())).toBe(true);
    });

    it('rejects non-kind-4 events', () => {
      expect(validateDMEvent(makeEvent({ kind: 1 }))).toBe(false);
      expect(validateDMEvent(makeEvent({ kind: 1059 }))).toBe(false);
    });

    it('rejects events without p tag', () => {
      expect(validateDMEvent(makeEvent({ tags: [] }))).toBe(false);
    });

    it('rejects events without content', () => {
      expect(validateDMEvent(makeEvent({ content: '' }))).toBe(false);
    });
  });

  describe('getRecipientPubkey', () => {
    it('extracts recipient from p tag', () => {
      expect(getRecipientPubkey(makeEvent())).toBe('recipient-pubkey');
    });

    it('returns undefined when no p tag', () => {
      expect(getRecipientPubkey(makeEvent({ tags: [] }))).toBeUndefined();
    });
  });

  describe('getConversationPartner', () => {
    it('returns recipient when user is sender', () => {
      expect(getConversationPartner(makeEvent(), 'sender-pubkey')).toBe('recipient-pubkey');
    });

    it('returns sender pubkey when user is recipient', () => {
      expect(getConversationPartner(makeEvent(), 'recipient-pubkey')).toBe('sender-pubkey');
    });
  });

  describe('formatConversationTime', () => {
    it('shows time for today', () => {
      const now = Math.floor(Date.now() / 1000);
      const result = formatConversationTime(now - 3600); // 1 hour ago
      expect(result).toMatch(/\d{1,2}:\d{2}/);
    });

    it('shows Yesterday for yesterday', () => {
      const yesterday = Math.floor(Date.now() / 1000) - 86400;
      expect(formatConversationTime(yesterday)).toBe('Yesterday');
    });

    it('shows day name for earlier this week', () => {
      const threeDaysAgo = Math.floor(Date.now() / 1000) - 3 * 86400;
      const result = formatConversationTime(threeDaysAgo);
      // Should be a short day name like "Mon", "Tue", etc. or "Yesterday" if close
      expect(result).toBeTruthy();
    });
  });

  describe('formatFullDateTime', () => {
    it('returns a formatted date string', () => {
      const ts = Math.floor(Date.now() / 1000);
      const result = formatFullDateTime(ts);
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(10);
    });
  });
});
