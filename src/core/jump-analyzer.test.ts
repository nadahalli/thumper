import { describe, it, expect, beforeEach } from 'vitest';
import { JumpAnalyzer } from './jump-analyzer';

function bufferWithAmplitude(amplitude: number, size = 64): Int16Array {
  const buf = new Int16Array(size);
  buf[0] = amplitude;
  return buf;
}

describe('JumpAnalyzer', () => {
  let analyzer: JumpAnalyzer;

  beforeEach(() => {
    analyzer = new JumpAnalyzer(5000, 200, 2000);
  });

  it('buffer above threshold triggers jump', () => {
    expect(analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1000)).toBe(true);
  });

  it('buffer below threshold does not trigger', () => {
    expect(analyzer.processBuffer(bufferWithAmplitude(3000), 64, 1000)).toBe(false);
  });

  it('cooldown prevents rapid consecutive jumps', () => {
    expect(analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1000)).toBe(true);
    expect(analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1100)).toBe(false);
  });

  it('jump detected after cooldown expires', () => {
    expect(analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1000)).toBe(true);
    expect(analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1100)).toBe(false);
    expect(analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1201)).toBe(true);
  });

  it('empty buffer does not trigger', () => {
    expect(analyzer.processBuffer(bufferWithAmplitude(6000), 0, 1000)).toBe(false);
  });

  it('threshold change takes effect immediately', () => {
    expect(analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1000)).toBe(true);
    analyzer.threshold = 10000;
    expect(analyzer.processBuffer(bufferWithAmplitude(6000), 64, 2000)).toBe(false);
    analyzer.threshold = 5000;
    expect(analyzer.processBuffer(bufferWithAmplitude(6000), 64, 3000)).toBe(true);
  });

  it('reset clears cooldown state', () => {
    expect(analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1000)).toBe(true);
    analyzer.reset();
    expect(analyzer.processBuffer(bufferWithAmplitude(6000), 64, 1050)).toBe(true);
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
