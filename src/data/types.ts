export interface Workout {
  id?: number;
  startTimeMillis: number;
  durationSeconds: number;
  avgHeartRate: number | null;
  jumpCount: number | null;
  jumpTimeSeconds: number | null;
}

export interface WorkoutSample {
  id?: number;
  workoutId: number;
  timestampMillis: number;
  heartRate: number | null;
  jumpCount: number;
}

export type ConnectionState = 'disconnected' | 'scanning' | 'connecting' | 'connected';

export interface ScannedDevice {
  name: string;
  deviceId: string;
  device: BluetoothDevice;
}
