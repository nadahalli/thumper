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
});
