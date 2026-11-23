import { describe, it, expect } from 'vitest';
import { buildLaps, toTrackPoints } from './workout-laps';
import type { Workout, WorkoutSample } from '../data/types';

const T = 1_700_000_000_000;

function s(sec: number, jumpCount = 0, heartRate: number | null = 100): WorkoutSample {
  return { workoutId: 1, timestampMillis: T + sec * 1000, heartRate, jumpCount };
}

function w(sets: Workout['sets']): Workout {
  return {
    id: 1, startTimeMillis: T, durationSeconds: 100, avgHeartRate: null,
    jumpCount: 30, jumpTimeSeconds: null, sets,
  };
}

describe('toTrackPoints', () => {
  it('computes jumps per minute over a trailing 10 s window', () => {
    const pts = toTrackPoints([s(0, 0), s(1, 2), s(10, 20), s(20, 30)]);
    expect(pts.map((p) => p.cadence)).toEqual([null, 120, 120, 60]);
  });

  it('sorts samples by time', () => {
    const pts = toTrackPoints([s(5, 10), s(0, 0)]);
    expect(pts.map((p) => p.timestampMillis)).toEqual([T, T + 5000]);
    expect(pts[1].cadence).toBe(120);
  });

  it('caps cadence at 254', () => {
    expect(toTrackPoints([s(0, 0), s(1, 10)])[1].cadence).toBe(254);
  });

  it('defaults rrIntervalsMs to empty', () => {
    expect(toTrackPoints([s(0)])[0].rrIntervalsMs).toEqual([]);
  });
});

describe('buildLaps', () => {
  const sets = [
    { startMs: T + 10_000, endMs: T + 30_000, jumps: 10 },
    { startMs: T + 60_000, endMs: T + 80_000, jumps: 20 },
  ];

  it('emits leading, between and trailing rest laps around sets', () => {
    const laps = buildLaps(w(sets), [s(2), s(20), s(45), s(70), s(90)]);
    expect(laps.map((l) => l.kind)).toEqual(['rest', 'active', 'rest', 'active', 'rest']);
    expect(laps.map((l) => l.jumps)).toEqual([0, 10, 0, 20, 0]);
    expect(laps[0].startMs).toBe(T + 2000);
    expect(laps[2]).toMatchObject({ startMs: T + 30_000, endMs: T + 60_000 });
    expect(laps[4]).toMatchObject({ startMs: T + 80_000, endMs: T + 90_000 });
  });

  it('every sample lands in exactly one lap', () => {
    const samples = Array.from({ length: 95 }, (_, i) => s(i));
    const laps = buildLaps(w(sets), samples);
    expect(laps.reduce((n, l) => n + l.points.length, 0)).toBe(95);
  });

  it('skips rest laps with no samples', () => {
    const laps = buildLaps(w(sets), [s(20), s(70)]);
    expect(laps.map((l) => l.kind)).toEqual(['active', 'active']);
  });

  it('no sets gives one active lap with the workout jump count', () => {
    const laps = buildLaps(w([]), [s(0), s(50)]);
    expect(laps).toHaveLength(1);
    expect(laps[0]).toMatchObject({ kind: 'active', startMs: T, endMs: T + 100_000, jumps: 30 });
  });
});
