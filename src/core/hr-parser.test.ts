import { describe, it, expect } from 'vitest';
import { parseHeartRate } from './hr-parser';

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
