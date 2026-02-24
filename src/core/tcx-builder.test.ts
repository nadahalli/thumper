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

describe('buildTcx', () => {
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
