export interface Streak {
  jumps: number;
  durationMs: number;
}

export class JumpAnalyzer {
  threshold: number;
  private cooldownMs: number;
  private maxGapMs: number;
  private streakRequired: number;
  private streakWindowMs: number;
  private lastJumpTimeMs = 0;
  jumpTimeMs = 0;

  // Streak gating: buffer detected jumps until a streak confirms real jumping
  private pendingJumps: number[] = [];
  private gateOpen = false;

  // Streak tracking
  private completedStreaks: Streak[] = [];
  private curStreakJumps = 0;
  private curStreakStartMs = 0;
  private curStreakLastMs = 0;

  constructor(
    threshold = 8000,
    cooldownMs = 200,
    maxGapMs = 2000,
    streakRequired = 10,
    streakWindowMs = 8000,
  ) {
    this.threshold = threshold;
    this.cooldownMs = cooldownMs;
    this.maxGapMs = maxGapMs;
    this.streakRequired = streakRequired;
    this.streakWindowMs = streakWindowMs;
  }

  /** Returns the number of confirmed jumps (0 if buffering or no detection). */
  processBuffer(buffer: ArrayLike<number>, readCount: number, nowMs: number): number {
    if (readCount <= 0) return 0;

    let maxAmplitude = 0;
    for (let i = 0; i < readCount; i++) {
      const sample = Math.abs(buffer[i]);
      if (sample > maxAmplitude) maxAmplitude = sample;
    }

    if (maxAmplitude <= this.threshold || nowMs - this.lastJumpTimeMs <= this.cooldownMs) {
      return 0;
    }

    // A jump was detected
    const gap = this.lastJumpTimeMs > 0 ? nowMs - this.lastJumpTimeMs : 0;

    // Close gate if gap since last jump is too large
    if (this.gateOpen && gap > this.maxGapMs) {
      this.completedStreaks.push({
        jumps: this.curStreakJumps,
        durationMs: this.curStreakLastMs - this.curStreakStartMs,
      });
      this.gateOpen = false;
    }

    this.lastJumpTimeMs = nowMs;

    if (this.gateOpen) {
      if (gap > 0 && gap <= this.maxGapMs) {
        this.jumpTimeMs += gap;
      }
      this.curStreakJumps++;
      this.curStreakLastMs = nowMs;
      return 1;
    }

    // Gate closed: buffer this jump for streak detection
    this.pendingJumps.push(nowMs);

    // Prune jumps outside the streak window
    while (this.pendingJumps.length > 0 && nowMs - this.pendingJumps[0] > this.streakWindowMs) {
      this.pendingJumps.shift();
    }

    if (this.pendingJumps.length >= this.streakRequired) {
      this.gateOpen = true;
      const count = this.pendingJumps.length;

      // Retroactively accumulate jumpTime for the confirmed streak
      for (let i = 1; i < this.pendingJumps.length; i++) {
        const pendingGap = this.pendingJumps[i] - this.pendingJumps[i - 1];
        if (pendingGap <= this.maxGapMs) {
          this.jumpTimeMs += pendingGap;
        }
      }

      // Start tracking this streak
      this.curStreakJumps = count;
      this.curStreakStartMs = this.pendingJumps[0];
      this.curStreakLastMs = this.pendingJumps[count - 1];

      this.pendingJumps = [];
      return count;
    }

    return 0;
  }

  /** Returns the top N streaks by jump count, including any in-progress streak. */
  topStreaks(n: number): Streak[] {
    const all = [...this.completedStreaks];
    if (this.gateOpen && this.curStreakJumps > 0) {
      all.push({ jumps: this.curStreakJumps, durationMs: this.curStreakLastMs - this.curStreakStartMs });
    }
    all.sort((a, b) => b.jumps - a.jumps);
    return all.slice(0, n);
  }

  reset(): void {
    this.lastJumpTimeMs = 0;
    this.jumpTimeMs = 0;
    this.pendingJumps = [];
    this.gateOpen = false;
    this.completedStreaks = [];
    this.curStreakJumps = 0;
    this.curStreakStartMs = 0;
    this.curStreakLastMs = 0;
  }
}
