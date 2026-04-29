import { describe, it, expect, vi } from 'vitest';

// The config is parsed from YAML at module init time via config.yaml?raw.
// Since the YAML raw import is mocked at the vitest level, we test getDistrictEmail
// which was initialized with the real YAML content baked in at import time.

// Mock the config.yaml?raw to provide test data
vi.mock('../../config.yaml?raw', () => ({
  default: `
districtEmails:
  default: raycountycommissioners@commission.raycountymo.gov
  districts:
    County: raycountycommissioners@commission.raycountymo.gov
    Crystal Lakes: raycountycommissioners@commission.raycountymo.gov
    Camden: vasmithey@gmail.com
    Lawson: shookdld@aol.com
    Excelsior Springs: raycountycommissioners@commission.raycountymo.gov
    Henrietta: raycountycommissioners@commission.raycountymo.gov
    Orrick: dnailfarms@gmail.com
    Richmond: susan_coats@sbcglobal.net
    Hardin: kodell2008411@gmail.com
`,
}));

describe('getDistrictEmail', () => {
  it('returns district-specific email from config', async () => {
    const { getDistrictEmail } = await import('@/lib/constants');
    expect(getDistrictEmail('Richmond')).toBe('susan_coats@sbcglobal.net');
    expect(getDistrictEmail('Camden')).toBe('vasmithey@gmail.com');
    expect(getDistrictEmail('Orrick')).toBe('dnailfarms@gmail.com');
  });

  it('returns default for unknown district', async () => {
    const { getDistrictEmail } = await import('@/lib/constants');
    expect(getDistrictEmail('Unknown Township')).toBe('raycountycommissioners@commission.raycountymo.gov');
  });

  it('returns default for undefined district', async () => {
    const { getDistrictEmail } = await import('@/lib/constants');
    expect(getDistrictEmail(undefined)).toBe('raycountycommissioners@commission.raycountymo.gov');
  });

  it('returns correct email for each known district', async () => {
    const { getDistrictEmail } = await import('@/lib/constants');
    expect(getDistrictEmail('Hardin')).toBe('kodell2008411@gmail.com');
    expect(getDistrictEmail('Lawson')).toBe('shookdld@aol.com');
    expect(getDistrictEmail('Henrietta')).toBe('raycountycommissioners@commission.raycountymo.gov');
  });
});
