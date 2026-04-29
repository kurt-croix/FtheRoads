import { describe, it, expect } from 'vitest';
import { lookupRoadDistrict } from '@/lib/jurisdiction';

describe('jurisdiction', () => {
  it('finds Richmond district for Richmond coordinates', () => {
    // Richmond, MO: ~39.27, -93.98
    const result = lookupRoadDistrict(39.27, -93.98);
    expect(result).not.toBeNull();
    expect(result!.name).toBeTruthy();
  });

  it('finds a district for Ray County center', () => {
    const result = lookupRoadDistrict(39.4, -93.9);
    expect(result).not.toBeNull();
  });

  it('returns null for coordinates outside Ray County', () => {
    // NYC
    const result = lookupRoadDistrict(40.7128, -74.006);
    expect(result).toBeNull();
  });

  it('returns null for Kansas City', () => {
    const result = lookupRoadDistrict(39.0997, -94.5786);
    expect(result).toBeNull();
  });

  it('finds Camden for Camden area', () => {
    // Camden, MO: ~39.2, -94.0
    const result = lookupRoadDistrict(39.2, -94.0);
    expect(result).not.toBeNull();
  });

  it('returns object with name and roadCode', () => {
    const result = lookupRoadDistrict(39.4, -93.9);
    expect(result).toHaveProperty('name');
    expect(result).toHaveProperty('roadCode');
    expect(typeof result!.name).toBe('string');
    expect(typeof result!.roadCode).toBe('string');
  });
});
