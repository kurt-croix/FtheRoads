import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadDistrictEmailConfig, getDistrictEmail } from '@/lib/constants';

describe('district email config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the module-level _emailConfig by re-importing
    // Since it's module state, we test getDistrictEmail behavior
  });

  describe('getDistrictEmail (fallback)', () => {
    it('returns default for unknown district', () => {
      const email = getDistrictEmail('Unknown Township');
      expect(email).toBe('croix4clerk@pm.me');
    });

    it('returns default for undefined district', () => {
      const email = getDistrictEmail(undefined);
      expect(email).toBe('croix4clerk@pm.me');
    });

    it('returns district-specific email from fallback map', () => {
      // These come from the hardcoded DISTRICT_EMAIL_MAP fallback
      const richmond = getDistrictEmail('Richmond');
      expect(richmond).toBeTruthy();

      const camden = getDistrictEmail('Camden');
      expect(camden).toBeTruthy();

      const orrick = getDistrictEmail('Orrick');
      expect(orrick).toBeTruthy();
    });
  });

  describe('loadDistrictEmailConfig', () => {
    it('fetches and loads district-emails.json', async () => {
      const mockConfig = {
        default: 'test@example.com',
        districts: {
          'Richmond': 'richmond@example.com',
          'Camden': 'camden@example.com',
        },
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockConfig),
      });

      await loadDistrictEmailConfig();

      expect(global.fetch).toHaveBeenCalledWith('/district-emails.json');
      // After loading, getDistrictEmail should use the config
      expect(getDistrictEmail('Richmond')).toBe('richmond@example.com');
      expect(getDistrictEmail('Unknown')).toBe('test@example.com');
    });

    it('falls back gracefully on fetch failure', async () => {
      global.fetch = vi.fn().mockRejectedValueOnce(new Error('network error'));

      // Should not throw
      await loadDistrictEmailConfig();

      // Fallback map should still work
      const email = getDistrictEmail('Richmond');
      expect(email).toBeTruthy();
    });

    it('falls back gracefully on non-ok response', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      await loadDistrictEmailConfig();

      const email = getDistrictEmail('Richmond');
      expect(email).toBeTruthy();
    });
  });
});
