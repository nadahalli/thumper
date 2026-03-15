import { describe, it, expect, beforeEach } from 'vitest';
import { JumpAnalyzer } from './jump-analyzer';

function bufferWithAmplitude(amplitude: number, size = 64): Int16Array {
  const buf = new Int16Array(size);
  buf[0] = amplitude;
  return buf;
}

describe('JumpAnalyzer (detection)', () => {
  let analyzer: JumpAnalyzer;

  beforeEach(() => {
    // streakRequired=1 so every detected jump confirms immediately
    analyzer = new JumpAnalyzer(5000, 200, 2000, 1);
  });

  it('buffer above threshold triggers jump', () => {
    expect(analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1000)).toBe(1);
  });

  it('buffer below threshold does not trigger', () => {
    expect(analyzer.processBuffer(bufferWithAmplitude(3000), 64, 1000)).toBe(0);
  });

  it('cooldown prevents rapid consecutive jumps', () => {
    expect(analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1000)).toBe(1);
    expect(analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1100)).toBe(0);
  });

  it('jump detected after cooldown expires', () => {
    expect(analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1000)).toBe(1);
    expect(analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1100)).toBe(0);
    expect(analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1201)).toBe(1);
  });

  it('empty buffer does not trigger', () => {
    expect(analyzer.processBuffer(bufferWithAmplitude(6000), 0, 1000)).toBe(0);
  });

  it('threshold change takes effect immediately', () => {
    expect(analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1000)).toBe(1);
    analyzer.threshold = 10000;
    expect(analyzer.processBuffer(bufferWithAmplitude(6000), 64, 2000)).toBe(0);
    analyzer.threshold = 5000;
    expect(analyzer.processBuffer(bufferWithAmplitude(6000), 64, 3000)).toBe(1);
  });

  it('reset clears cooldown state', () => {
    expect(analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1000)).toBe(1);
    analyzer.reset();
    expect(analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1050)).toBe(1);
  });

  it('jump time accumulates for consecutive jumps within max gap', () => {
    analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1000);
    analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1500);
    analyzer.processBuffer(bufferWithAmplitude(6000), 64, 2000);
    expect(analyzer.jumpTimeMs).toBe(1000);
  });

  it('jump time excludes gaps beyond max gap', () => {
    analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1000);
    analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1500);
    // 5s gap - beyond maxGapMs
    analyzer.processBuffer(bufferWithAmplitude(6000), 64, 6500);
    analyzer.processBuffer(bufferWithAmplitude(6000), 64, 7000);
    expect(analyzer.jumpTimeMs).toBe(1000); // 500 from first pair + 500 from second pair
  });

  it('reset clears jump time', () => {
    analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1000);
    analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1500);
    expect(analyzer.jumpTimeMs).toBe(500);
    analyzer.reset();
    expect(analyzer.jumpTimeMs).toBe(0);
  });
});

describe('JumpAnalyzer (streak gating)', () => {
  const STREAK = 5;
  const WINDOW = 4000;
  let analyzer: JumpAnalyzer;

  beforeEach(() => {
    // threshold=5000, cooldown=200ms, maxGap=2000ms, streak=5, window=4s
    analyzer = new JumpAnalyzer(5000, 200, 2000, STREAK, WINDOW);
  });

  it('jumps below streak threshold stay pending and return 0', () => {
    for (let i = 0; i < STREAK - 1; i++) {
      expect(analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1000 + i * 500)).toBe(0);
    }
  });

  it('reaching streak threshold returns all pending jumps', () => {
    for (let i = 0; i < STREAK - 1; i++) {
      analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1000 + i * 500);
    }
    const confirmed = analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1000 + (STREAK - 1) * 500);
    expect(confirmed).toBe(STREAK);
  });

  it('after streak confirmed, subsequent jumps return 1', () => {
    // Confirm a streak
    for (let i = 0; i < STREAK; i++) {
      analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1000 + i * 500);
    }
    // Next jump should count immediately
    expect(analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1000 + STREAK * 500)).toBe(1);
  });

  it('gate closes after gap exceeds maxGapMs', () => {
    // Confirm a streak
    for (let i = 0; i < STREAK; i++) {
      analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1000 + i * 500);
    }
    const lastStreakTime = 1000 + (STREAK - 1) * 500;

    // Big gap: 3s > maxGap of 2s
    const afterGap = lastStreakTime + 3000;
    expect(analyzer.processBuffer(bufferWithAmplitude(6000), 64, afterGap)).toBe(0);
  });

  it('new streak required after gate closes', () => {
    // Confirm first streak
    for (let i = 0; i < STREAK; i++) {
      analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1000 + i * 500);
    }
    const lastStreakTime = 1000 + (STREAK - 1) * 500;

    // Big gap closes the gate
    const restartBase = lastStreakTime + 3000;
    for (let i = 0; i < STREAK - 1; i++) {
      expect(analyzer.processBuffer(bufferWithAmplitude(6000), 64, restartBase + i * 500)).toBe(0);
    }
    // Completing new streak returns all pending
    expect(analyzer.processBuffer(bufferWithAmplitude(6000), 64, restartBase + (STREAK - 1) * 500)).toBe(STREAK);
  });

  it('sparse noise outside streak window does not accumulate', () => {
    // Spikes spaced 2s apart, so only ~2 fit in the 4s window at any time
    analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1000);
    analyzer.processBuffer(bufferWithAmplitude(6000), 64, 3000);
    analyzer.processBuffer(bufferWithAmplitude(6000), 64, 5000);
    analyzer.processBuffer(bufferWithAmplitude(6000), 64, 7000);
    analyzer.processBuffer(bufferWithAmplitude(6000), 64, 9000);
    // None of these should confirm: at any point, only 2-3 are within the 4s window
    expect(analyzer.processBuffer(bufferWithAmplitude(6000), 64, 11000)).toBe(0);
  });

  it('jumpTime accumulates correctly for retroactive streak', () => {
    // 5 jumps 500ms apart
    for (let i = 0; i < STREAK; i++) {
      analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1000 + i * 500);
    }
    // jumpTime should be 4 gaps of 500ms = 2000ms
    expect(analyzer.jumpTimeMs).toBe((STREAK - 1) * 500);
  });

  it('reset clears streak state', () => {
    // Buffer some pending jumps
    for (let i = 0; i < STREAK - 1; i++) {
      analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1000 + i * 500);
    }
    analyzer.reset();

    // Need a full streak again
    for (let i = 0; i < STREAK - 1; i++) {
      expect(analyzer.processBuffer(bufferWithAmplitude(6000), 64, 5000 + i * 500)).toBe(0);
    }
    expect(analyzer.processBuffer(bufferWithAmplitude(6000), 64, 5000 + (STREAK - 1) * 500)).toBe(STREAK);
  });

  it('topStreaks includes in-progress streak', () => {
    // Confirm a streak of 5
    for (let i = 0; i < STREAK; i++) {
      analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1000 + i * 500);
    }
    // Add 3 more jumps (still in same streak)
    for (let i = 0; i < 3; i++) {
      analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1000 + (STREAK + i) * 500);
    }

    const streaks = analyzer.topStreaks(3);
    expect(streaks).toHaveLength(1);
    expect(streaks[0].jumps).toBe(STREAK + 3);
    expect(streaks[0].durationMs).toBe((STREAK + 2) * 500); // first to last
  });

  it('topStreaks returns completed streaks sorted by jumps', () => {
    // Streak 1: 5 jumps
    for (let i = 0; i < STREAK; i++) {
      analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1000 + i * 500);
    }
    const streak1End = 1000 + (STREAK - 1) * 500;

    // Gap to close streak 1
    const streak2Start = streak1End + 3000;

    // Streak 2: 5 + 5 more = 10 jumps
    for (let i = 0; i < STREAK; i++) {
      analyzer.processBuffer(bufferWithAmplitude(6000), 64, streak2Start + i * 500);
    }
    for (let i = 0; i < STREAK; i++) {
      analyzer.processBuffer(bufferWithAmplitude(6000), 64, streak2Start + (STREAK + i) * 500);
    }

    const streaks = analyzer.topStreaks(3);
    expect(streaks).toHaveLength(2);
    expect(streaks[0].jumps).toBe(STREAK * 2); // longer streak first
    expect(streaks[1].jumps).toBe(STREAK);
  });

  it('topStreaks limited to requested count', () => {
    let t = 1000;
    // Create 4 streaks with gaps between them
    for (let s = 0; s < 4; s++) {
      for (let i = 0; i < STREAK; i++) {
        analyzer.processBuffer(bufferWithAmplitude(6000), 64, t);
        t += 500;
      }
      t += 3000; // gap to close streak
    }

    expect(analyzer.topStreaks(2)).toHaveLength(2);
  });

  it('reset clears streak tracking', () => {
    for (let i = 0; i < STREAK; i++) {
      analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1000 + i * 500);
    }
    expect(analyzer.topStreaks(3)).toHaveLength(1);

    analyzer.reset();
    expect(analyzer.topStreaks(3)).toHaveLength(0);
  });

  it('allStreaks returns chronological order with startMs', () => {
    // Streak 1
    for (let i = 0; i < STREAK; i++) {
      analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1000 + i * 500);
    }
    const streak1End = 1000 + (STREAK - 1) * 500;

    // Gap to close streak 1
    const streak2Base = streak1End + 3000;

    // Streak 2 (in progress)
    for (let i = 0; i < STREAK; i++) {
      analyzer.processBuffer(bufferWithAmplitude(6000), 64, streak2Base + i * 500);
    }

    const all = analyzer.allStreaks();
    expect(all).toHaveLength(2);
    expect(all[0].startMs).toBe(1000);
    expect(all[1].startMs).toBe(streak2Base);
    // Chronological: first streak before second
    expect(all[0].startMs).toBeLessThan(all[1].startMs);
  });
});
