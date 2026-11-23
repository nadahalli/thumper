export interface WorkoutSet {
  startMs: number;
  endMs: number;
  jumps: number;
}

export interface Workout {
  id?: number;
  startTimeMillis: number;
  durationSeconds: number;
  avgHeartRate: number | null;
  jumpCount: number | null;
  jumpTimeSeconds: number | null;
  sets?: WorkoutSet[];
}

export interface WorkoutSample {
  id?: number;
  workoutId: number;
  timestampMillis: number;
  heartRate: number | null;
  jumpCount: number;
  /** RR intervals (ms) received since the previous sample. Absent on older workouts. */
  rrIntervalsMs?: number[];
}

export type ConnectionState = 'disconnected' | 'scanning' | 'connecting' | 'connected';

export interface ScannedDevice {
  name: string;
  deviceId: string;
  device: BluetoothDevice;
}
