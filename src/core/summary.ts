export interface WorkoutSummary {
  durationSeconds: number;
  jumpTimeSeconds: number;
  avgHeartRate: number | null;
  jumpCount: number | null;
  jumpsPerMinute: number | null;
}

export function computeSummary(
  durationSeconds: number,
  hrReadings: number[],
  jumpCount: number,
  jumpTimeMs: number,
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
  };
}
