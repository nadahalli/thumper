import { describe, it, expect } from 'vitest';
import { parseHeartRate, parseHeartRateMeasurement } from './hr-parser';

function dataView(bytes: number[]): DataView {
  return new DataView(new Uint8Array(bytes).buffer);
}

describe('parseHeartRate', () => {
  it('8-bit format parses single byte', () => {
    // flags=0x00, HR=72
    expect(parseHeartRate(dataView([0x00, 72]))).toBe(72);
  });

  it('16-bit format parses two bytes little-endian', () => {
    // flags=0x01, HR=300 (0x012C) as [0x2C, 0x01]
    expect(parseHeartRate(dataView([0x01, 0x2c, 0x01]))).toBe(300);
  });

  it('empty byte array returns 0', () => {
    expect(parseHeartRate(dataView([]))).toBe(0);
  });

  it('high 8-bit value parsed correctly', () => {
    // flags=0x00, HR=200 (0xC8)
    expect(parseHeartRate(dataView([0x00, 0xc8]))).toBe(200);
  });
});

describe('parseHeartRateMeasurement', () => {
  it('no RR flag returns empty intervals', () => {
    expect(parseHeartRateMeasurement(dataView([0x00, 72]))).toEqual({ bpm: 72, rrIntervalsMs: [] });
  });

  it('8-bit HR with two RR intervals (1/1024 s units)', () => {
    // flags=0x10, HR=150, RR=1024 (1000 ms) and 512 (500 ms)
    const m = parseHeartRateMeasurement(dataView([0x10, 150, 0x00, 0x04, 0x00, 0x02]));
    expect(m).toEqual({ bpm: 150, rrIntervalsMs: [1000, 500] });
  });

  it('16-bit HR with energy expended skips the energy field', () => {
    // flags=0x19 (16-bit HR, energy, RR), HR=160, energy=0x1234, RR=410 (400 ms)
    const m = parseHeartRateMeasurement(dataView([0x19, 160, 0x00, 0x34, 0x12, 0x9a, 0x01]));
    expect(m).toEqual({ bpm: 160, rrIntervalsMs: [400] });
  });

  it('ignores a trailing odd byte', () => {
    const m = parseHeartRateMeasurement(dataView([0x10, 150, 0x00, 0x04, 0x01]));
    expect(m.rrIntervalsMs).toEqual([1000]);
  });

  it('empty byte array returns 0 bpm', () => {
    expect(parseHeartRateMeasurement(dataView([]))).toEqual({ bpm: 0, rrIntervalsMs: [] });
  });
});
