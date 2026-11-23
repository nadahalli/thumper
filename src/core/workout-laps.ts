import type { Workout, WorkoutSample } from '../data/types';

/** Trailing window for the per-sample jump rate. */
const JUMP_RATE_WINDOW_MS = 10_000;
/** TCX Cadence and FIT record cadence are both capped at 254. */
const MAX_CADENCE = 254;

export interface TrackPoint {
  timestampMillis: number;
  heartRate: number | null;
  /** Jumps per minute over the trailing window, or null for the first sample. */
  cadence: number | null;
  rrIntervalsMs: number[];
}

export interface ExportLap {
  kind: 'active' | 'rest';
  startMs: number;
  endMs: number;
  /** Jumps in this lap. Always 0 for rest laps. */
  jumps: number;
  points: TrackPoint[];
}

/** Jump rate at each sample, from the cumulative jumpCount over the trailing window. */
export function toTrackPoints(samples: WorkoutSample[]): TrackPoint[] {
  const sorted = [...samples].sort((a, b) => a.timestampMillis - b.timestampMillis);
  let j = 0;
  return sorted.map((s, i) => {
    while (j < i && s.timestampMillis - sorted[j].timestampMillis > JUMP_RATE_WINDOW_MS) j++;
    let cadence: number | null = null;
    const dt = s.timestampMillis - sorted[j].timestampMillis;
    if (j < i && dt > 0) {
      const perMin = ((s.jumpCount - sorted[j].jumpCount) * 60_000) / dt;
      cadence = Math.min(MAX_CADENCE, Math.max(0, Math.round(perMin)));
    }
    return {
      timestampMillis: s.timestampMillis,
      heartRate: s.heartRate,
      cadence,
      rrIntervalsMs: s.rrIntervalsMs ?? [],
    };
  });
}

/**
 * Split a workout into active laps (one per set) and rest laps (samples recorded
 * before, between, or after sets). A rest lap is emitted only if it has samples.
 * Workouts without sets produce one active lap covering everything.
 */
export function buildLaps(workout: Workout, samples: WorkoutSample[]): ExportLap[] {
  const points = toTrackPoints(samples);
  const sets = [...(workout.sets ?? [])].sort((a, b) => a.startMs - b.startMs);

  if (sets.length === 0) {
    const startMs = workout.startTimeMillis;
    return [{
      kind: 'active',
      startMs,
      endMs: startMs + workout.durationSeconds * 1000,
      jumps: workout.jumpCount ?? 0,
      points,
    }];
  }

  const laps: ExportLap[] = [];
  const pushRest = (pts: TrackPoint[], startMs: number, endMs: number) => {
    if (pts.length > 0) laps.push({ kind: 'rest', startMs, endMs, jumps: 0, points: pts });
  };

  const leading = points.filter((p) => p.timestampMillis < sets[0].startMs);
  if (leading.length > 0) pushRest(leading, leading[0].timestampMillis, sets[0].startMs);

  sets.forEach((set, i) => {
    laps.push({
      kind: 'active',
      startMs: set.startMs,
      endMs: set.endMs,
      jumps: set.jumps,
      points: points.filter((p) => p.timestampMillis >= set.startMs && p.timestampMillis <= set.endMs),
    });
    const next = sets[i + 1];
    if (next) {
      pushRest(
        points.filter((p) => p.timestampMillis > set.endMs && p.timestampMillis < next.startMs),
        set.endMs,
        next.startMs,
      );
    }
  });

  const last = sets[sets.length - 1];
  const trailing = points.filter((p) => p.timestampMillis > last.endMs);
  if (trailing.length > 0) pushRest(trailing, last.endMs, trailing[trailing.length - 1].timestampMillis);

  return laps;
}

export function lapHeartRate(lap: ExportLap): { avg: number | null; max: number | null } {
  const hr = lap.points.map((p) => p.heartRate).filter((h): h is number => h != null);
  if (hr.length === 0) return { avg: null, max: null };
  return {
    avg: Math.round(hr.reduce((a, b) => a + b, 0) / hr.length),
    max: Math.max(...hr),
  };
}
