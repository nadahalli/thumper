import type { Streak } from './jump-analyzer';
import type { WorkoutSet } from '../data/types';

const SET_GAP_MS = 15_000;

export interface WorkoutSummary {
  durationSeconds: number;
  jumpTimeSeconds: number;
  avgHeartRate: number | null;
  jumpCount: number | null;
  jumpsPerMinute: number | null;
  topStreaks: Streak[];
  sets: WorkoutSet[];
}

/** Merge streaks into sets: consecutive streaks within gapMs are grouped. */
export function groupSets(streaks: Streak[], gapMs = SET_GAP_MS): WorkoutSet[] {
  if (streaks.length === 0) return [];

  const sets: WorkoutSet[] = [];
  let cur: WorkoutSet = {
    startMs: streaks[0].startMs,
    endMs: streaks[0].startMs + streaks[0].durationMs,
    jumps: streaks[0].jumps,
  };

  for (let i = 1; i < streaks.length; i++) {
    const s = streaks[i];
    if (s.startMs - cur.endMs <= gapMs) {
      cur.endMs = s.startMs + s.durationMs;
      cur.jumps += s.jumps;
    } else {
      sets.push(cur);
      cur = { startMs: s.startMs, endMs: s.startMs + s.durationMs, jumps: s.jumps };
    }
  }
  sets.push(cur);

  return sets;
}

export function computeSummary(
  durationSeconds: number,
  hrReadings: number[],
  jumpCount: number,
  jumpTimeMs: number,
  topStreaks: Streak[] = [],
  sets: WorkoutSet[] = [],
): WorkoutSummary {
  const avgHeartRate =
    hrReadings.length > 0
      ? Math.round(hrReadings.reduce((a, b) => a + b, 0) / hrReadings.length)
      : null;

  const jumpTimeSeconds = Math.floor(jumpTimeMs / 1000);

  const jpm =
    jumpTimeSeconds > 0 && jumpCount > 0
      ? jumpCount / (jumpTimeSeconds / 60)
      : null;

  return {
    durationSeconds,
    jumpTimeSeconds,
    avgHeartRate,
    jumpCount: jumpCount > 0 ? jumpCount : null,
    jumpsPerMinute: jpm,
    topStreaks,
    sets,
  };
}
