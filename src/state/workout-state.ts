import { JumpAnalyzer } from '../core/jump-analyzer';
import { computeSummary, type WorkoutSummary } from '../core/summary';
import { AudioCapture } from '../api/audio';
import { BluetoothHR } from '../api/bluetooth';
import { WakeLockManager } from '../api/wake-lock';
import { db } from '../data/db';
import type { ConnectionState, ScannedDevice, WorkoutSample } from '../data/types';

export type WorkoutPhase = 'idle' | 'countdown' | 'active' | 'paused' | 'stopped';

type Listener = () => void;

const COUNTDOWN_SECONDS = 5;
const SAMPLE_INTERVAL_MS = 5000;
const SENSITIVITY_KEY = 'thumper_sensitivity';

export interface AudioAdapter {
  start(): Promise<void>;
  stop(): void;
}

export interface BluetoothAdapter {
  onHeartRate: ((bpm: number) => void) | null;
  onStateChange: ((state: ConnectionState) => void) | null;
  scan(): Promise<ScannedDevice>;
  connect(device: ScannedDevice): Promise<void>;
  disconnect(): void;
}

export interface WakeLockAdapter {
  acquire(): Promise<void>;
  release(): Promise<void>;
}

export interface DbAdapter {
  addWorkout(w: {
    startTimeMillis: number;
    durationSeconds: number;
    avgHeartRate: number | null;
    jumpCount: number | null;
    jumpTimeSeconds: number;
  }): Promise<number>;
  addSamples(samples: WorkoutSample[]): Promise<void>;
}

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface WorkoutDeps {
  audio: AudioAdapter;
  bluetooth: BluetoothAdapter;
  wakeLock: WakeLockAdapter;
  db: DbAdapter;
  storage: StorageAdapter;
}

function defaultDeps(): WorkoutDeps {
  const analyzer = new JumpAnalyzer();
  let jumpCallback: (() => void) | null = null;
  const audio = new AudioCapture(analyzer, () => jumpCallback?.());
  const bluetooth = new BluetoothHR();
  const wakeLock = new WakeLockManager();

  return {
    audio: {
      start: () => audio.start(),
      stop: () => audio.stop(),
      // Expose internals for the default case
      get _analyzer() { return analyzer; },
      set _jumpCallback(cb: (() => void) | null) { jumpCallback = cb; },
    } as AudioAdapter & { _analyzer: JumpAnalyzer; _jumpCallback: (() => void) | null },
    bluetooth,
    wakeLock,
    db: {
      addWorkout: (w) => db.workouts.add(w) as Promise<number>,
      addSamples: (s) => db.workout_samples.bulkAdd(s) as unknown as Promise<void>,
    },
    storage: localStorage,
  };
}

export class WorkoutState {
  // Public state
  phase: WorkoutPhase = 'idle';
  countdown = 0;
  elapsedSeconds = 0;
  jumpCount = 0;
  heartRate: number | null = null;
  connectionState: ConnectionState = 'disconnected';
  summary: WorkoutSummary | null = null;

  // Internal
  private listeners = new Set<Listener>();
  private analyzer: JumpAnalyzer;
  private deps: WorkoutDeps;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private sampleInterval: ReturnType<typeof setInterval> | null = null;
  private countdownInterval: ReturnType<typeof setInterval> | null = null;
  private startTimeMs = 0;
  private pausedElapsed = 0;
  private hrReadings: number[] = [];
  private samples: WorkoutSample[] = [];
  private workoutId: number | undefined = undefined;

  constructor(deps?: WorkoutDeps) {
    this.deps = deps ?? defaultDeps();

    const saved = this.deps.storage.getItem(SENSITIVITY_KEY);
    const threshold = saved ? parseInt(saved, 10) : 8000;

    // For default deps, the analyzer lives inside the AudioCapture.
    // For injected deps, we create a standalone one (tests don't need audio).
    if (!deps) {
      const defaultAudio = this.deps.audio as AudioAdapter & { _analyzer: JumpAnalyzer; _jumpCallback: (() => void) | null };
      this.analyzer = defaultAudio._analyzer;
      this.analyzer.threshold = threshold;
      defaultAudio._jumpCallback = () => {
        if (this.phase === 'active') {
          this.jumpCount++;
          this.notify();
        }
      };
    } else {
      this.analyzer = new JumpAnalyzer(threshold);
    }

    this.deps.bluetooth.onHeartRate = (bpm) => {
      this.heartRate = bpm;
      if (this.phase === 'active') {
        this.hrReadings.push(bpm);
      }
      this.notify();
    };

    this.deps.bluetooth.onStateChange = (state) => {
      this.connectionState = state;
      this.notify();
    };
  }

  get sensitivity(): number {
    return this.analyzer.threshold;
  }

  setSensitivity(value: number): void {
    this.analyzer.threshold = value;
    this.deps.storage.setItem(SENSITIVITY_KEY, String(value));
    this.notify();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  // BLE
  async scanAndConnect(): Promise<void> {
    const scanned: ScannedDevice = await this.deps.bluetooth.scan();
    await this.deps.bluetooth.connect(scanned);
  }

  disconnectBle(): void {
    this.deps.bluetooth.disconnect();
  }

  // Workout lifecycle
  async start(): Promise<void> {
    this.phase = 'countdown';
    this.countdown = COUNTDOWN_SECONDS;
    this.jumpCount = 0;
    this.elapsedSeconds = 0;
    this.hrReadings = [];
    this.samples = [];
    this.summary = null;
    this.analyzer.reset();
    this.notify();

    await this.deps.audio.start();

    this.countdownInterval = setInterval(() => {
      this.countdown--;
      if (this.countdown <= 0) {
        clearInterval(this.countdownInterval!);
        this.countdownInterval = null;
        this.beginActive();
      }
      this.notify();
    }, 1000);
  }

  private async beginActive(): Promise<void> {
    this.phase = 'active';
    this.startTimeMs = Date.now();
    this.pausedElapsed = 0;
    await this.deps.wakeLock.acquire();

    this.timerInterval = setInterval(() => {
      this.elapsedSeconds = Math.floor((Date.now() - this.startTimeMs) / 1000);
      this.notify();
    }, 1000);

    this.sampleInterval = setInterval(() => {
      this.collectSample();
    }, SAMPLE_INTERVAL_MS);

    this.notify();
  }

  pause(): void {
    if (this.phase !== 'active') return;
    this.phase = 'paused';
    this.pausedElapsed = this.elapsedSeconds;
    this.clearTimers();
    this.notify();
  }

  resume(): void {
    if (this.phase !== 'paused') return;
    this.phase = 'active';
    this.startTimeMs = Date.now() - this.pausedElapsed * 1000;

    this.timerInterval = setInterval(() => {
      this.elapsedSeconds = Math.floor((Date.now() - this.startTimeMs) / 1000);
      this.notify();
    }, 1000);

    this.sampleInterval = setInterval(() => {
      this.collectSample();
    }, SAMPLE_INTERVAL_MS);

    this.notify();
  }

  async stop(): Promise<void> {
    this.phase = 'stopped';
    this.clearTimers();
    this.deps.audio.stop();
    await this.deps.wakeLock.release();

    // Collect final sample
    this.collectSample();

    // Compute summary (don't persist yet, wait for save/discard)
    this.summary = computeSummary(
      this.elapsedSeconds,
      this.hrReadings,
      this.jumpCount,
      this.analyzer.jumpTimeMs,
    );

    this.notify();
  }

  async saveWorkout(): Promise<void> {
    if (!this.summary) return;

    this.workoutId = await this.deps.db.addWorkout({
      startTimeMillis: this.startTimeMs,
      durationSeconds: this.elapsedSeconds,
      avgHeartRate: this.summary.avgHeartRate,
      jumpCount: this.summary.jumpCount,
      jumpTimeSeconds: this.summary.jumpTimeSeconds,
    });

    const samplesWithWorkoutId = this.samples.map((s) => ({
      ...s,
      workoutId: this.workoutId!,
    }));
    await this.deps.db.addSamples(samplesWithWorkoutId);

    this.summary = null;
    this.phase = 'idle';
    this.notify();
  }

  discardWorkout(): void {
    this.summary = null;
    this.phase = 'idle';
    this.notify();
  }

  private collectSample(): void {
    this.samples.push({
      workoutId: 0, // filled on save
      timestampMillis: Date.now(),
      heartRate: this.heartRate,
      jumpCount: this.jumpCount,
    });
  }

  private clearTimers(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.sampleInterval) {
      clearInterval(this.sampleInterval);
      this.sampleInterval = null;
    }
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }
}
