import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkoutState, type WorkoutDeps } from './workout-state';
import type { WorkoutSample } from '../data/types';

function createMockDeps(): WorkoutDeps & {
  savedWorkouts: unknown[];
  savedSamples: WorkoutSample[];
  audioStarted: boolean;
  audioStopped: boolean;
  wakeLockAcquired: boolean;
  wakeLockReleased: boolean;
} {
  const mock = {
    savedWorkouts: [] as unknown[],
    savedSamples: [] as WorkoutSample[],
    audioStarted: false,
    audioStopped: false,
    wakeLockAcquired: false,
    wakeLockReleased: false,
    audio: {
      start: vi.fn(async () => { mock.audioStarted = true; }),
      stop: vi.fn(() => { mock.audioStopped = true; }),
    },
    bluetooth: {
      onHeartRate: null,
      onStateChange: null,
      scan: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
    },
    wakeLock: {
      acquire: vi.fn(async () => { mock.wakeLockAcquired = true; }),
      release: vi.fn(async () => { mock.wakeLockReleased = true; }),
    },
    db: {
      addWorkout: vi.fn(async () => {
        const id = mock.savedWorkouts.length + 1;
        mock.savedWorkouts.push(id);
        return id;
      }),
      addSamples: vi.fn(async (samples: WorkoutSample[]) => {
        mock.savedSamples.push(...samples);
      }),
    },
    storage: {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    },
  };
  return mock;
}

/** Advance fake timers until countdown (5s) completes and phase becomes 'active'. */
async function advancePastCountdown(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    vi.advanceTimersByTime(1000);
    // Let any microtasks (beginActive's async wake lock) flush
    await vi.advanceTimersByTimeAsync(0);
  }
}

describe('WorkoutState lifecycle', () => {
  let state: WorkoutState;
  let deps: ReturnType<typeof createMockDeps>;

  beforeEach(() => {
    vi.useFakeTimers();
    deps = createMockDeps();
    state = new WorkoutState(deps);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts in idle phase', () => {
    expect(state.phase).toBe('idle');
    expect(state.jumpCount).toBe(0);
    expect(state.elapsedSeconds).toBe(0);
    expect(state.summary).toBeNull();
  });

  it('start transitions to countdown', async () => {
    await state.start();
    expect(state.phase).toBe('countdown');
    expect(state.countdown).toBe(5);
    expect(deps.audioStarted).toBe(true);
  });

  it('countdown ticks down each second', async () => {
    await state.start();

    vi.advanceTimersByTime(1000);
    expect(state.countdown).toBe(4);

    vi.advanceTimersByTime(1000);
    expect(state.countdown).toBe(3);

    vi.advanceTimersByTime(1000);
    expect(state.countdown).toBe(2);
  });

  it('countdown completes and transitions to active', async () => {
    await state.start();
    await advancePastCountdown();

    expect(state.phase).toBe('active');
    expect(state.countdown).toBe(0);
    expect(deps.wakeLockAcquired).toBe(true);
  });

  it('pause from active transitions to paused', async () => {
    await state.start();
    await advancePastCountdown();

    state.pause();
    expect(state.phase).toBe('paused');
  });

  it('pause from non-active is a no-op', async () => {
    await state.start();
    // Still in countdown
    state.pause();
    expect(state.phase).toBe('countdown');
  });

  it('resume from paused transitions to active', async () => {
    await state.start();
    await advancePastCountdown();

    state.pause();
    expect(state.phase).toBe('paused');

    state.resume();
    expect(state.phase).toBe('active');
  });

  it('resume from non-paused is a no-op', async () => {
    await state.start();
    await advancePastCountdown();
    expect(state.phase).toBe('active');

    state.resume();
    expect(state.phase).toBe('active');
  });

  it('stop transitions to stopped with summary', async () => {
    await state.start();
    await advancePastCountdown();

    await state.stop();

    expect(state.phase).toBe('stopped');
    expect(state.summary).not.toBeNull();
    expect(deps.audioStopped).toBe(true);
    expect(deps.wakeLockReleased).toBe(true);
  });

  it('stop does not persist to db', async () => {
    await state.start();
    await advancePastCountdown();
    await state.stop();

    expect(deps.db.addWorkout).not.toHaveBeenCalled();
    expect(deps.db.addSamples).not.toHaveBeenCalled();
  });

  it('saveWorkout persists to db and returns to idle', async () => {
    await state.start();
    await advancePastCountdown();
    await state.stop();
    await state.saveWorkout();

    expect(deps.db.addWorkout).toHaveBeenCalledOnce();
    expect(deps.db.addSamples).toHaveBeenCalledOnce();
    expect(state.phase).toBe('idle');
    expect(state.summary).toBeNull();
  });

  it('discardWorkout does not persist and returns to idle', async () => {
    await state.start();
    await advancePastCountdown();
    await state.stop();

    state.discardWorkout();

    expect(deps.db.addWorkout).not.toHaveBeenCalled();
    expect(deps.db.addSamples).not.toHaveBeenCalled();
    expect(state.phase).toBe('idle');
    expect(state.summary).toBeNull();
  });

  it('full flow: start -> countdown -> active -> pause -> resume -> stop -> save', async () => {
    const phases: string[] = [];
    state.subscribe(() => {
      if (phases[phases.length - 1] !== state.phase) {
        phases.push(state.phase);
      }
    });

    await state.start();
    await advancePastCountdown();
    state.pause();
    state.resume();
    await state.stop();
    await state.saveWorkout();

    expect(phases).toEqual(['countdown', 'active', 'paused', 'active', 'stopped', 'idle']);
    expect(deps.savedWorkouts).toHaveLength(1);
  });

  it('subscriber is notified on state changes', async () => {
    const listener = vi.fn();
    state.subscribe(listener);

    await state.start();
    expect(listener).toHaveBeenCalled();
  });

  it('unsubscribe stops notifications', async () => {
    const listener = vi.fn();
    const unsub = state.subscribe(listener);
    unsub();

    await state.start();
    expect(listener).not.toHaveBeenCalled();
  });

  it('sensitivity persists to storage', () => {
    state.setSensitivity(12000);
    expect(deps.storage.setItem).toHaveBeenCalledWith('thumper_sensitivity', '12000');
    expect(state.sensitivity).toBe(12000);
  });

  it('sensitivity loads from storage on construction', () => {
    deps.storage.getItem = vi.fn(() => '6000');
    const s = new WorkoutState(deps);
    expect(s.sensitivity).toBe(6000);
  });

  it('saveWorkout is no-op if no summary', async () => {
    await state.saveWorkout();
    expect(deps.db.addWorkout).not.toHaveBeenCalled();
  });

  it('start resets state from a previous workout', async () => {
    await state.start();
    await advancePastCountdown();
    state.jumpCount = 42;
    await state.stop();
    state.discardWorkout();

    await state.start();
    expect(state.jumpCount).toBe(0);
    expect(state.elapsedSeconds).toBe(0);
    expect(state.summary).toBeNull();
    expect(state.phase).toBe('countdown');
  });

  it('heart rate updates during active phase are recorded', async () => {
    await state.start();
    await advancePastCountdown();

    // Simulate BLE heart rate updates
    deps.bluetooth.onHeartRate?.(120);
    deps.bluetooth.onHeartRate?.(130);
    expect(state.heartRate).toBe(130);

    await state.stop();
    expect(state.summary!.avgHeartRate).toBe(125);
  });

  it('heart rate updates outside active phase are not recorded in summary', async () => {
    // HR update before workout
    deps.bluetooth.onHeartRate?.(100);
    expect(state.heartRate).toBe(100);

    await state.start();
    await advancePastCountdown();
    await state.stop();

    // No HR readings during active phase
    expect(state.summary!.avgHeartRate).toBeNull();
  });

  it('bluetooth state changes update connectionState', () => {
    deps.bluetooth.onStateChange?.('scanning');
    expect(state.connectionState).toBe('scanning');

    deps.bluetooth.onStateChange?.('connected');
    expect(state.connectionState).toBe('connected');
  });
});
