export class JumpAnalyzer {
  threshold: number;
  private cooldownMs: number;
  private maxGapMs: number;
  private lastJumpTimeMs = 0;
  jumpTimeMs = 0;

  constructor(threshold = 8000, cooldownMs = 200, maxGapMs = 2000) {
    this.threshold = threshold;
    this.cooldownMs = cooldownMs;
    this.maxGapMs = maxGapMs;
  }

  processBuffer(buffer: ArrayLike<number>, readCount: number, nowMs: number): boolean {
    if (readCount <= 0) return false;

    let maxAmplitude = 0;
    for (let i = 0; i < readCount; i++) {
      const sample = Math.abs(buffer[i]);
      if (sample > maxAmplitude) maxAmplitude = sample;
    }

    if (maxAmplitude > this.threshold && nowMs - this.lastJumpTimeMs > this.cooldownMs) {
      if (this.lastJumpTimeMs > 0) {
        const gap = nowMs - this.lastJumpTimeMs;
        if (gap <= this.maxGapMs) {
          this.jumpTimeMs += gap;
        }
      }
      this.lastJumpTimeMs = nowMs;
      return true;
    }
    return false;
  }

  reset(): void {
    this.lastJumpTimeMs = 0;
    this.jumpTimeMs = 0;
  }
}
