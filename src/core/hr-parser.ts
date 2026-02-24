export function parseHeartRate(data: DataView): number {
  if (data.byteLength === 0) return 0;
  const flags = data.getUint8(0);
  // Bit 0: 0 = uint8, 1 = uint16
  if ((flags & 0x01) === 0) {
    return data.getUint8(1);
  }
  return data.getUint16(1, true); // little-endian
}

export const HR_SERVICE_UUID = '0000180d-0000-1000-8000-00805f9b34fb';
export const HR_MEASUREMENT_UUID = '00002a37-0000-1000-8000-00805f9b34fb';
