import { describe, it, expect } from 'vitest';
import { buildTcx } from './tcx-builder';
import type { Workout, WorkoutSample } from '../data/types';

const BASE_TS = 1_700_000_000_000; // 2023-11-14T22:13:20.000Z

function workout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: 1,
    startTimeMillis: BASE_TS,
    durationSeconds: 1234,
    avgHeartRate: null,
    jumpCount: null,
    jumpTimeSeconds: null,
    ...overrides,
  };
}

function sample(overrides: Partial<WorkoutSample> = {}): WorkoutSample {
  return {
    id: 1,
    workoutId: 1,
    timestampMillis: BASE_TS,
    heartRate: null,
    jumpCount: 0,
    ...overrides,
  };
}

describe('buildTcx (legacy single-lap)', () => {
  it('single workout produces valid TCX structure', () => {
    const tcx = buildTcx([workout()], new Map([[1, [sample()]]]));
    expect(tcx).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(tcx).toContain('<TrainingCenterDatabase');
    expect(tcx).toContain('<Activities>');
    expect(tcx).toContain('<Activity Sport="Other">');
    expect(tcx).toContain('<Lap StartTime=');
    expect(tcx).toContain('<Track>');
    expect(tcx).toContain('<Trackpoint>');
  });

  it('timestamps are ISO 8601 UTC', () => {
    const tcx = buildTcx([workout()], new Map([[1, [sample()]]]));
    expect(tcx).toContain('2023-11-14T22:13:20.000Z');
  });

  it('HeartRateBpm present only when heartRate is non-null', () => {
    const withHr = buildTcx(
      [workout()],
      new Map([[1, [sample({ heartRate: 145 })]]]),
    );
    expect(withHr).toContain('<HeartRateBpm>');
    expect(withHr).toContain('<Value>145</Value>');

    const withoutHr = buildTcx(
      [workout()],
      new Map([[1, [sample({ heartRate: null })]]]),
    );
    expect(withoutHr).not.toContain('<HeartRateBpm>');
  });

  it('multiple workouts produce multiple Activity elements', () => {
    const w1 = workout({ id: 1 });
    const w2 = workout({ id: 2, startTimeMillis: BASE_TS + 60_000 });
    const tcx = buildTcx([w1, w2], new Map());
    const matches = tcx.match(/<Activity Sport="Other">/g);
    expect(matches).toHaveLength(2);
  });

  it('empty samples produces Lap with empty Track', () => {
    const tcx = buildTcx([workout()], new Map());
    expect(tcx).toContain('<Track>');
    expect(tcx).toContain('</Track>');
    expect(tcx).not.toContain('<Trackpoint>');
  });

  it('TotalTimeSeconds matches workout durationSeconds', () => {
    const tcx = buildTcx([workout({ durationSeconds: 999 })], new Map());
    expect(tcx).toContain('<TotalTimeSeconds>999</TotalTimeSeconds>');
  });

  it('Notes contains jump time when jumpTimeSeconds is present', () => {
    const tcx = buildTcx(
      [workout({ jumpTimeSeconds: 90 })],
      new Map(),
    );
    expect(tcx).toContain('<Notes>Jump time: 90s</Notes>');
  });

  it('Notes absent when jumpTimeSeconds is null', () => {
    const tcx = buildTcx(
      [workout({ jumpTimeSeconds: null })],
      new Map(),
    );
    expect(tcx).not.toContain('<Notes>');
  });
});

describe('buildTcx (multi-lap with sets)', () => {
  const set1Start = BASE_TS;
  const set1End = BASE_TS + 120_000;
  const set2Start = BASE_TS + 180_000;
  const set2End = BASE_TS + 300_000;

  const setsWorkout = workout({
    sets: [
      { startMs: set1Start, endMs: set1End, jumps: 50 },
      { startMs: set2Start, endMs: set2End, jumps: 80 },
    ],
  });

  const samples: WorkoutSample[] = [
    sample({ timestampMillis: BASE_TS + 5_000, heartRate: 120 }),
    sample({ timestampMillis: BASE_TS + 60_000, heartRate: 140 }),
    sample({ timestampMillis: BASE_TS + 115_000, heartRate: 150 }),
    // Gap between sets
    sample({ timestampMillis: BASE_TS + 150_000, heartRate: 110 }), // rest, outside both sets
    // Set 2
    sample({ timestampMillis: BASE_TS + 200_000, heartRate: 155 }),
    sample({ timestampMillis: BASE_TS + 280_000, heartRate: 170 }),
  ];

  it('produces one Lap per set', () => {
    const tcx = buildTcx([setsWorkout], new Map([[1, samples]]));
    const laps = tcx.match(/<Lap /g);
    expect(laps).toHaveLength(2);
  });

  it('each Lap has correct start time', () => {
    const tcx = buildTcx([setsWorkout], new Map([[1, samples]]));
    expect(tcx).toContain(`<Lap StartTime="${new Date(set1Start).toISOString()}">`);
    expect(tcx).toContain(`<Lap StartTime="${new Date(set2Start).toISOString()}">`);
  });

  it('each Lap has correct duration', () => {
    const tcx = buildTcx([setsWorkout], new Map([[1, samples]]));
    expect(tcx).toContain('<TotalTimeSeconds>120</TotalTimeSeconds>'); // set1: 120s
    expect(tcx).toContain('<TotalTimeSeconds>120</TotalTimeSeconds>'); // set2: 120s
  });

  it('Lap Notes contain jump count', () => {
    const tcx = buildTcx([setsWorkout], new Map([[1, samples]]));
    expect(tcx).toContain('<Notes>50 jumps</Notes>');
    expect(tcx).toContain('<Notes>80 jumps</Notes>');
  });

  it('HR samples are filtered to their respective Laps', () => {
    const tcx = buildTcx([setsWorkout], new Map([[1, samples]]));
    // Rest sample (ts=BASE+150s, HR=110) should not appear in any lap trackpoints
    // Set1 has HR 120, 140, 150; Set2 has HR 155, 170
    expect(tcx).toContain('<Value>120</Value>');
    expect(tcx).toContain('<Value>155</Value>');
    // The rest HR should still not be in any Lap since it's between sets
    // Count occurrences of 110 in HeartRateBpm context
    const hrMatches = tcx.match(/<Value>110<\/Value>/g);
    expect(hrMatches).toBeNull();
  });

  it('Laps include AverageHeartRateBpm and MaximumHeartRateBpm', () => {
    const tcx = buildTcx([setsWorkout], new Map([[1, samples]]));
    expect(tcx).toContain('<AverageHeartRateBpm>');
    expect(tcx).toContain('<MaximumHeartRateBpm>');
    // Set1 avg: round((120+140+150)/3) = 137, max: 150
    expect(tcx).toContain('<AverageHeartRateBpm><Value>137</Value></AverageHeartRateBpm>');
    expect(tcx).toContain('<MaximumHeartRateBpm><Value>150</Value></MaximumHeartRateBpm>');
    // Set2 avg: round((155+170)/2) = 163, max: 170
    expect(tcx).toContain('<AverageHeartRateBpm><Value>163</Value></AverageHeartRateBpm>');
    expect(tcx).toContain('<MaximumHeartRateBpm><Value>170</Value></MaximumHeartRateBpm>');
  });

  it('Laps include Intensity element', () => {
    const tcx = buildTcx([setsWorkout], new Map([[1, samples]]));
    expect(tcx).toContain('<Intensity>Active</Intensity>');
  });

  it('falls back to single lap when sets is empty', () => {
    const tcx = buildTcx([workout({ sets: [] })], new Map());
    const laps = tcx.match(/<Lap /g);
    expect(laps).toHaveLength(1);
    expect(tcx).not.toContain('<Intensity>');
  });
});
