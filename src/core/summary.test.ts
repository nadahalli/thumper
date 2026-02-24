import { describe, it, expect } from 'vitest';
import { computeSummary } from './summary';

describe('computeSummary', () => {
  it('average HR computed from list', () => {
    const s = computeSummary(300, [100, 120, 140], 50, 90_000);
    expect(s.avgHeartRate).toBe(120);
  });

  it('no HR readings yields null avgHeartRate', () => {
    const s = computeSummary(300, [], 50, 90_000);
    expect(s.avgHeartRate).toBeNull();
  });

  it('zero jumps yields null jumpCount and jumpsPerMinute', () => {
    const s = computeSummary(300, [120], 0, 0);
    expect(s.jumpCount).toBeNull();
    expect(s.jumpsPerMinute).toBeNull();
  });

  it('jumps per minute calculated correctly', () => {
    // 30 jumps / 90s jump time = 20 jpm
    const s = computeSummary(300, [120], 30, 90_000);
    expect(s.jumpsPerMinute).toBe(20);
  });

  it('zero jump time yields null jumpsPerMinute', () => {
    const s = computeSummary(300, [120], 10, 0);
    expect(s.jumpsPerMinute).toBeNull();
  });

  it('durationSeconds propagated directly', () => {
    const s = computeSummary(456, [], 0, 0);
    expect(s.durationSeconds).toBe(456);
  });

  it('jumpTimeSeconds is floor of jumpTimeMs / 1000', () => {
    const s = computeSummary(300, [], 10, 5500);
    expect(s.jumpTimeSeconds).toBe(5);
  });
});
