import type { WorkoutState } from '../state/workout-state';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function createWorkoutScreen(
  container: HTMLElement,
  state: WorkoutState,
  openSettings: () => void,
): void {
  container.innerHTML = `
    <div class="toolbar">
      <button class="btn-icon" id="btn-ble">HR Strap</button>
      <button class="btn-icon" id="btn-settings">Settings</button>
    </div>
    <div class="workout-stats">
      <div class="stat" id="countdown-stat" style="display:none">
        <div class="stat-value countdown" id="countdown-value"></div>
      </div>
      <div class="stat" id="bpm-stat">
        <div class="stat-value bpm" id="bpm-value">--</div>
        <div class="stat-label">BPM</div>
      </div>
      <div class="stat">
        <div class="stat-value jumps" id="jump-value">0</div>
        <div class="stat-label">Jumps</div>
      </div>
      <div class="stat">
        <div class="stat-value timer" id="timer-value">0:00</div>
        <div class="stat-label">Time</div>
      </div>
      <div class="ble-status" id="ble-status"></div>
    </div>
    <div class="controls" id="workout-controls">
      <button class="btn btn-start" id="btn-start">Start</button>
    </div>
  `;

  const btnBle = container.querySelector<HTMLButtonElement>('#btn-ble')!;
  const btnSettings = container.querySelector<HTMLButtonElement>('#btn-settings')!;
  const bpmValue = container.querySelector<HTMLElement>('#bpm-value')!;
  const jumpValue = container.querySelector<HTMLElement>('#jump-value')!;
  const timerValue = container.querySelector<HTMLElement>('#timer-value')!;
  const bleStatus = container.querySelector<HTMLElement>('#ble-status')!;
  const controls = container.querySelector<HTMLElement>('#workout-controls')!;
  const countdownStat = container.querySelector<HTMLElement>('#countdown-stat')!;
  const countdownValue = container.querySelector<HTMLElement>('#countdown-value')!;
  const bpmStat = container.querySelector<HTMLElement>('#bpm-stat')!;

  btnBle.addEventListener('click', async () => {
    if (state.connectionState === 'connected') {
      state.disconnectBle();
    } else {
      try {
        await state.scanAndConnect();
      } catch {
        // User cancelled or error
      }
    }
  });

  btnSettings.addEventListener('click', openSettings);

  function render(): void {
    // BPM
    bpmValue.textContent = state.heartRate != null ? String(state.heartRate) : '--';

    // BLE status
    const statusMap: Record<string, string> = {
      disconnected: '',
      scanning: 'Scanning...',
      connecting: 'Connecting...',
      connected: 'HR Strap Connected',
    };
    bleStatus.textContent = statusMap[state.connectionState];
    bleStatus.className = 'ble-status' + (state.connectionState === 'connected' ? ' connected' : '');

    // Countdown
    if (state.phase === 'countdown') {
      countdownStat.style.display = '';
      countdownValue.textContent = String(state.countdown);
      bpmStat.style.display = 'none';
    } else {
      countdownStat.style.display = 'none';
      bpmStat.style.display = '';
    }

    // Stats
    jumpValue.textContent = String(state.jumpCount);
    timerValue.textContent = formatTime(state.elapsedSeconds);

    // Controls
    switch (state.phase) {
      case 'idle':
      case 'stopped':
        controls.innerHTML = '<button class="btn btn-start" id="btn-start">Start</button>';
        break;
      case 'countdown':
        controls.innerHTML = '<button class="btn btn-stop" id="btn-stop">Cancel</button>';
        break;
      case 'active':
        controls.innerHTML = `
          <button class="btn btn-pause" id="btn-pause">Pause</button>
          <button class="btn btn-stop" id="btn-stop">Stop</button>
        `;
        break;
      case 'paused':
        controls.innerHTML = `
          <button class="btn btn-start" id="btn-resume">Resume</button>
          <button class="btn btn-stop" id="btn-stop">Stop</button>
        `;
        break;
    }

    // Rebind button events
    controls.querySelector('#btn-start')?.addEventListener('click', () => state.start());
    controls.querySelector('#btn-pause')?.addEventListener('click', () => state.pause());
    controls.querySelector('#btn-resume')?.addEventListener('click', () => state.resume());
    controls.querySelector('#btn-stop')?.addEventListener('click', () => state.stop());
  }

  state.subscribe(render);
  render();
}
