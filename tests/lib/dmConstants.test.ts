import { describe, it, expect } from 'vitest';
import { getMessageProtocol, isValidSendProtocol, MESSAGE_PROTOCOL, PROTOCOL_MODE, LOADING_PHASES } from '@/lib/dmConstants';

describe('dmConstants', () => {
  describe('getMessageProtocol', () => {
    it('returns NIP04 for kind 4', () => {
      expect(getMessageProtocol({ kind: 4 } as any)).toBe(MESSAGE_PROTOCOL.NIP04);
    });

    it('returns NIP17 for kind 1059', () => {
      expect(getMessageProtocol({ kind: 1059 } as any)).toBe(MESSAGE_PROTOCOL.NIP17);
    });

    it('returns UNKNOWN for other kinds', () => {
      expect(getMessageProtocol({ kind: 1 } as any)).toBe(MESSAGE_PROTOCOL.UNKNOWN);
      expect(getMessageProtocol({ kind: 0 } as any)).toBe(MESSAGE_PROTOCOL.UNKNOWN);
    });
  });

  describe('isValidSendProtocol', () => {
    it('accepts NIP04 and NIP17', () => {
      expect(isValidSendProtocol(MESSAGE_PROTOCOL.NIP04)).toBe(true);
      expect(isValidSendProtocol(MESSAGE_PROTOCOL.NIP17)).toBe(true);
    });

    it('rejects unknown protocol', () => {
      expect(isValidSendProtocol(MESSAGE_PROTOCOL.UNKNOWN)).toBe(false);
    });
  });

  describe('constants', () => {
    it('has all expected protocol modes', () => {
      expect(PROTOCOL_MODE.NIP04_ONLY).toBe('nip04_only');
      expect(PROTOCOL_MODE.NIP17_ONLY).toBe('nip17_only');
      expect(PROTOCOL_MODE.NIP04_OR_NIP17).toBe('nip04_or_nip17');
    });

    it('has all loading phases', () => {
      expect(LOADING_PHASES.IDLE).toBe('idle');
      expect(LOADING_PHASES.CACHE).toBe('cache');
      expect(LOADING_PHASES.READY).toBe('ready');
    });
  });
});
