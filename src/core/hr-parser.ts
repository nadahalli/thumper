export function parseHeartRate(data: DataView): number {
  if (data.byteLength === 0) return 0;
  const flags = data.getUint8(0);
  // Bit 0: 0 = uint8, 1 = uint16
  if ((flags & 0x01) === 0) {
    return data.getUint8(1);
  }
  return data.getUint16(1, true); // little-endian
}

export interface HeartRateMeasurement {
  bpm: number;
  /** RR intervals in milliseconds, oldest first. Empty if the sensor sent none. */
  rrIntervalsMs: number[];
}

/**
 * Parse a full Heart Rate Measurement (0x2A37) packet.
 * Flags: bit 0 = 16-bit HR, bit 3 = energy expended present, bit 4 = RR intervals present.
 * RR intervals are uint16 little-endian in units of 1/1024 s.
 */
export function parseHeartRateMeasurement(data: DataView): HeartRateMeasurement {
  if (data.byteLength === 0) return { bpm: 0, rrIntervalsMs: [] };
  const flags = data.getUint8(0);
  const hr16 = (flags & 0x01) !== 0;
  const bpm = parseHeartRate(data);

  let offset = hr16 ? 3 : 2;
  if (flags & 0x08) offset += 2; // skip energy expended

  const rrIntervalsMs: number[] = [];
  if (flags & 0x10) {
    while (offset + 1 < data.byteLength) {
      rrIntervalsMs.push(Math.round((data.getUint16(offset, true) * 1000) / 1024));
      offset += 2;
    }
  }
  return { bpm, rrIntervalsMs };
}

export const HR_SERVICE_UUID = '0000180d-0000-1000-8000-00805f9b34fb';
export const HR_MEASUREMENT_UUID = '00002a37-0000-1000-8000-00805f9b34fb';
