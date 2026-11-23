import { describe, it, expect } from 'vitest';
import { Decoder, Stream } from '@garmin/fitsdk';
import { buildFit } from './fit-builder';
import type { Workout, WorkoutSample } from '../data/types';

const T = 1_700_000_000_000;

function decode(bytes: Uint8Array): Record<string, any[]> {
  const decoder = new Decoder(Stream.fromByteArray(Array.from(bytes)));
  expect(decoder.isFIT()).toBe(true);
  expect(decoder.checkIntegrity()).toBe(true);
  const { messages, errors } = decoder.read();
  expect(errors).toEqual([]);
  return messages as Record<string, any[]>;
}

const workout: Workout = {
  id: 1, startTimeMillis: T, durationSeconds: 100, avgHeartRate: 140,
  jumpCount: 30, jumpTimeSeconds: 40,
  sets: [
    { startMs: T + 10_000, endMs: T + 30_000, jumps: 10 },
    { startMs: T + 60_000, endMs: T + 80_000, jumps: 20 },
  ],
};

// 1 jump/s during each set, flat in between
const samples: WorkoutSample[] = Array.from({ length: 90 }, (_, i) => ({
  workoutId: 1,
  timestampMillis: T + i * 1000,
  heartRate: 100 + i,
  jumpCount: i < 30 ? Math.max(0, i - 10) : i < 60 ? 20 : Math.min(40, 20 + (i - 60)),
  ...(i === 20 ? { rrIntervalsMs: [500, 510, 520, 530, 540, 550, 560] } : {}),
}));

describe('buildFit', () => {
  it('decodes as a jump rope activity with jump counts in totalCycles', () => {
    const m = decode(buildFit(workout, samples));
    expect(m.fileIdMesgs[0].type).toBe('activity');

    const session = m.sessionMesgs[0];
    expect(session.sport).toBe('jumpRope');
    expect(session.totalCycles).toBe(30);
    expect(session.avgHeartRate).toBe(140);
    expect(session.maxHeartRate).toBe(189);
    expect(session.numLaps).toBe(5);

    expect(m.lapMesgs.map((l) => l.intensity)).toEqual(['rest', 'active', 'rest', 'active', 'rest']);
    expect(m.lapMesgs.map((l) => l.totalCycles)).toEqual([0, 10, 0, 20, 0]);
    expect(m.lapMesgs[1].avgCadence).toBe(30); // 10 jumps in 20 s
    expect(m.activityMesgs[0].numSessions).toBe(1);
  });

  it('writes one record per sample with HR and cadence', () => {
    const m = decode(buildFit(workout, samples));
    expect(m.recordMesgs).toHaveLength(90);
    expect(m.recordMesgs[20].heartRate).toBe(120);
    expect(m.recordMesgs[20].cadence).toBe(60);
  });

  it('splits RR intervals into hrv messages of up to five', () => {
    const m = decode(buildFit(workout, samples));
    expect(m.hrvMesgs).toHaveLength(2);
    const rr = m.hrvMesgs.flatMap((h) => h.time).filter((x) => x != null);
    expect(rr.map((x: number) => Math.round(x * 1000))).toEqual([500, 510, 520, 530, 540, 550, 560]);
  });

  it('handles a legacy workout without sets or HR', () => {
    const legacy: Workout = { ...workout, sets: undefined, avgHeartRate: null };
    const m = decode(buildFit(legacy, samples.map((x) => ({ ...x, heartRate: null }))));
    expect(m.lapMesgs).toHaveLength(1);
    expect(m.sessionMesgs[0].totalCycles).toBe(30);
    expect(m.sessionMesgs[0].maxHeartRate).toBeUndefined();
  });
});
