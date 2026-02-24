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
  private audio: AudioCapture;
  private bluetooth = new BluetoothHR();
  private wakeLock = new WakeLockManager();
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private sampleInterval: ReturnType<typeof setInterval> | null = null;
  private countdownInterval: ReturnType<typeof setInterval> | null = null;
  private startTimeMs = 0;
  private pausedElapsed = 0;
  private hrReadings: number[] = [];
  private samples: WorkoutSample[] = [];
  private workoutId: number | undefined = undefined;

  constructor() {
    const saved = localStorage.getItem(SENSITIVITY_KEY);
    const threshold = saved ? parseInt(saved, 10) : 8000;

    this.analyzer = new JumpAnalyzer(threshold);
    this.audio = new AudioCapture(this.analyzer, () => {
      if (this.phase === 'active') {
        this.jumpCount++;
        this.notify();
      }
    });

    this.bluetooth.onHeartRate = (bpm) => {
      this.heartRate = bpm;
      if (this.phase === 'active') {
        this.hrReadings.push(bpm);
      }
      this.notify();
    };

    this.bluetooth.onStateChange = (state) => {
      this.connectionState = state;
      this.notify();
    };
  }

  get sensitivity(): number {
    return this.analyzer.threshold;
  }

  setSensitivity(value: number): void {
    this.analyzer.threshold = value;
    localStorage.setItem(SENSITIVITY_KEY, String(value));
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
    const scanned: ScannedDevice = await this.bluetooth.scan();
    await this.bluetooth.connect(scanned);
  }

  disconnectBle(): void {
    this.bluetooth.disconnect();
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

    await this.audio.start();

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
    await this.wakeLock.acquire();

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
    this.audio.stop();
    await this.wakeLock.release();

    // Collect final sample
    this.collectSample();

    // Compute summary
    this.summary = computeSummary(
      this.elapsedSeconds,
      this.hrReadings,
      this.jumpCount,
      this.analyzer.jumpTimeMs,
    );

    // Persist workout
    this.workoutId = await db.workouts.add({
      startTimeMillis: this.startTimeMs,
      durationSeconds: this.elapsedSeconds,
      avgHeartRate: this.summary.avgHeartRate,
      jumpCount: this.summary.jumpCount,
      jumpTimeSeconds: this.summary.jumpTimeSeconds,
    });

    // Persist samples
    const samplesWithWorkoutId = this.samples.map((s) => ({
      ...s,
      workoutId: this.workoutId!,
    }));
    await db.workout_samples.bulkAdd(samplesWithWorkoutId);

    this.notify();
  }

  dismissSummary(): void {
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
