import { describe, it, expect } from 'vitest';
import { computeSummary, groupSets } from './summary';
import type { Streak } from './jump-analyzer';

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

describe('groupSets', () => {
  function streak(startMs: number, jumps: number, durationMs: number): Streak {
    return { startMs, jumps, durationMs };
  }

  it('empty streaks returns empty sets', () => {
    expect(groupSets([])).toEqual([]);
  });

  it('single streak becomes single set', () => {
    const sets = groupSets([streak(1000, 20, 5000)]);
    expect(sets).toEqual([{ startMs: 1000, endMs: 6000, jumps: 20 }]);
  });

  it('close streaks merge into one set', () => {
    // Two streaks 10s apart (< 15s default gap)
    const sets = groupSets([
      streak(1000, 20, 5000),   // 1000-6000
      streak(16000, 15, 4000),  // 16000-20000, gap = 10s
    ]);
    expect(sets).toHaveLength(1);
    expect(sets[0]).toEqual({ startMs: 1000, endMs: 20000, jumps: 35 });
  });

  it('distant streaks become separate sets', () => {
    // Two streaks 30s apart (> 15s default gap)
    const sets = groupSets([
      streak(1000, 20, 5000),   // 1000-6000
      streak(36000, 15, 4000),  // 36000-40000, gap = 30s
    ]);
    expect(sets).toHaveLength(2);
    expect(sets[0].jumps).toBe(20);
    expect(sets[1].jumps).toBe(15);
  });

  it('custom gap threshold', () => {
    const sets = groupSets([
      streak(1000, 10, 3000),   // 1000-4000
      streak(10000, 10, 3000),  // 10000-13000, gap = 6s
    ], 5000);
    // 6s gap > 5s threshold, so two sets
    expect(sets).toHaveLength(2);
  });

  it('multiple merges produce correct sets', () => {
    const sets = groupSets([
      streak(0, 10, 5000),       // 0-5000
      streak(8000, 10, 5000),    // 8000-13000, gap=3s, merge
      streak(16000, 10, 5000),   // 16000-21000, gap=3s, merge
      streak(60000, 10, 5000),   // 60000-65000, gap=39s, new set
    ]);
    expect(sets).toHaveLength(2);
    expect(sets[0]).toEqual({ startMs: 0, endMs: 21000, jumps: 30 });
    expect(sets[1]).toEqual({ startMs: 60000, endMs: 65000, jumps: 10 });
  });
});
