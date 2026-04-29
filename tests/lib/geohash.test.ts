import { describe, it, expect } from 'vitest';
import { encodeGeohash, decodeGeohash } from '@/lib/geohash';

describe('geohash', () => {
  describe('encodeGeohash', () => {
    it('encodes Ray County center coordinates', () => {
      const hash = encodeGeohash(39.4, -93.9, 8);
      expect(hash).toHaveLength(8);
      expect(hash).toMatch(/^[0-9bcdefghjkmnpqrstuvwxyz]+$/);
    });

    it('encodes with different precision', () => {
      expect(encodeGeohash(39.4, -93.9, 4)).toHaveLength(4);
      expect(encodeGeohash(39.4, -93.9, 12)).toHaveLength(12);
    });

    it('produces known geohash for NYC', () => {
      // NYC ~40.7128, -74.0060 → known prefix "dr5reg"
      const hash = encodeGeohash(40.7128, -74.006, 6);
      expect(hash).toMatch(/^dr5r/);
    });

    it('handles edge coordinates', () => {
      expect(encodeGeohash(0, 0, 4)).toMatch(/^s000/);
      expect(encodeGeohash(90, 180, 4)).toBeTruthy();
      expect(encodeGeohash(-90, -180, 4)).toBeTruthy();
    });
  });

  describe('decodeGeohash', () => {
    it('round-trips within tolerance', () => {
      const lat = 39.28;
      const lng = -93.98;
      const hash = encodeGeohash(lat, lng, 10);
      const decoded = decodeGeohash(hash);
      expect(Math.abs(decoded.lat - lat)).toBeLessThan(0.001);
      expect(Math.abs(decoded.lng - lng)).toBeLessThan(0.001);
    });

    it('returns center of cell', () => {
      const decoded = decodeGeohash('9zn');
      expect(decoded.lat).toBeGreaterThan(-90);
      expect(decoded.lat).toBeLessThan(90);
      expect(decoded.lng).toBeGreaterThan(-180);
      expect(decoded.lng).toBeLessThan(180);
    });

    it('handles empty hash', () => {
      const decoded = decodeGeohash('');
      expect(decoded.lat).toBe(0);
      expect(decoded.lng).toBe(0);
    });
  });
});
