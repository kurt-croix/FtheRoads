import { describe, it, expect } from 'vitest';
import { genUserName } from '@/lib/genUserName';

describe('genUserName', () => {
  // --- Basic contract ---
  it('returns a string', () => {
    expect(typeof genUserName('some-seed')).toBe('string');
  });

  it('returns a non-empty string', () => {
    const result = genUserName('some-seed');
    expect(result.length).toBeGreaterThan(0);
  });

  // Format: "<Adjective> <Noun>" — always exactly one space between words
  it('returns two words separated by a space', () => {
    const result = genUserName('some-seed');
    const parts = result.split(' ');
    expect(parts).toHaveLength(2);
    // Each word should be title-cased (first char uppercase)
    for (const word of parts) {
      expect(word[0]).toBe(word[0].toUpperCase());
    }
  });

  // --- Determinism ---
  it('is deterministic: same input always produces the same output', () => {
    const seed = 'npub1abc123def456';
    const first = genUserName(seed);
    const second = genUserName(seed);
    expect(first).toBe(second);
  });

  it('is deterministic across many calls', () => {
    const seed = 'abc';
    const results = Array.from({ length: 100 }, () => genUserName(seed));
    const unique = new Set(results);
    expect(unique.size).toBe(1);
  });

  // --- Uniqueness (different inputs) ---
  it('produces different outputs for different inputs', () => {
    const a = genUserName('seed-alpha');
    const b = genUserName('seed-beta');
    expect(a).not.toBe(b);
  });

  it('produces distinct names for a batch of unique seeds', () => {
    const seeds = [
      'alice-pubkey-001',
      'bob-pubkey-002',
      'carol-pubkey-003',
      'dave-pubkey-004',
      'eve-pubkey-005',
    ];
    const names = seeds.map(genUserName);
    const unique = new Set(names);
    // With 24x24 = 576 possible combinations and only 5 seeds,
    // we expect all distinct
    expect(unique.size).toBe(seeds.length);
  });

  // --- Edge cases ---
  it('handles an empty string seed', () => {
    // hash starts at 0, loop body never executes, hash stays 0
    // adjIndex = 0, nounIndex = 0 => "Swift Fox"
    const result = genUserName('');
    expect(result).toBe('Swift Fox');
  });

  it('handles a single-character seed', () => {
    const result = genUserName('a');
    expect(typeof result).toBe('string');
    expect(result.split(' ')).toHaveLength(2);
  });

  it('handles a short pubkey (3 chars)', () => {
    const result = genUserName('abc');
    expect(typeof result).toBe('string');
    expect(result.split(' ')).toHaveLength(2);
  });

  it('handles a realistic npub', () => {
    const npub = 'npub1x0d3yn5q2q4y9g5cz3e2vfr8kqxl7pe5j3540cmhf0rsez99sgpqh3wtg5';
    const result = genUserName(npub);
    expect(typeof result).toBe('string');
    expect(result.split(' ')).toHaveLength(2);
    // Also verify determinism for this realistic input
    expect(result).toBe(genUserName(npub));
  });

  it('handles a seed with only whitespace', () => {
    const result = genUserName('   ');
    expect(typeof result).toBe('string');
    expect(result.split(' ')).toHaveLength(2);
  });

  it('handles a seed with unicode characters', () => {
    const result = genUserName('用户密钥');
    expect(typeof result).toBe('string');
    expect(result.split(' ')).toHaveLength(2);
  });

  // --- Output always comes from known word lists ---
  it('always returns words from the adjective and noun pools', () => {
    const adjectives = [
      'Swift', 'Bright', 'Calm', 'Bold', 'Wise', 'Kind', 'Quick', 'Brave',
      'Cool', 'Sharp', 'Clear', 'Strong', 'Smart', 'Fast', 'Keen', 'Pure',
      'Noble', 'Gentle', 'Fierce', 'Steady', 'Clever', 'Proud', 'Silent', 'Wild'
    ];
    const nouns = [
      'Fox', 'Eagle', 'Wolf', 'Bear', 'Lion', 'Tiger', 'Hawk', 'Owl',
      'Deer', 'Raven', 'Falcon', 'Lynx', 'Otter', 'Whale', 'Shark', 'Dolphin',
      'Phoenix', 'Dragon', 'Panther', 'Jaguar', 'Cheetah', 'Leopard', 'Puma', 'Cobra'
    ];

    const seeds = ['', 'a', 'abc', 'npub1test', 'x'.repeat(1000)];
    for (const seed of seeds) {
      const [adj, noun] = genUserName(seed).split(' ');
      expect(adjectives).toContain(adj);
      expect(nouns).toContain(noun);
    }
  });
});
