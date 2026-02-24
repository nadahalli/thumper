import { parseHeartRate, HR_SERVICE_UUID, HR_MEASUREMENT_UUID } from '../core/hr-parser';
import type { ConnectionState, ScannedDevice } from '../data/types';

export class BluetoothHR {
  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;

  onHeartRate: ((bpm: number) => void) | null = null;
  onStateChange: ((state: ConnectionState) => void) | null = null;

  async scan(): Promise<ScannedDevice> {
    this.onStateChange?.('scanning');
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [HR_SERVICE_UUID] }],
    });
    return {
      name: device.name ?? 'Unknown',
      deviceId: device.id,
      device,
    };
  }

  async connect(scanned: ScannedDevice): Promise<void> {
    this.onStateChange?.('connecting');
    this.device = scanned.device;

    this.device.addEventListener('gattserverdisconnected', () => {
      this.onStateChange?.('disconnected');
    });

    const server = await this.device.gatt!.connect();
    const service = await server.getPrimaryService(HR_SERVICE_UUID);
    this.characteristic = await service.getCharacteristic(HR_MEASUREMENT_UUID);

    this.characteristic.addEventListener('characteristicvaluechanged', (event) => {
      const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
      if (value) {
        const bpm = parseHeartRate(value);
        this.onHeartRate?.(bpm);
      }
    });

    await this.characteristic.startNotifications();
    this.onStateChange?.('connected');
  }

  disconnect(): void {
    this.device?.gatt?.disconnect();
    this.device = null;
    this.characteristic = null;
    this.onStateChange?.('disconnected');
  }
}
