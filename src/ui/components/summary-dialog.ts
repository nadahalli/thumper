import type { WorkoutState } from '../../state/workout-state';

function row(label: string, value: string): string {
  return `<div class="dialog-row"><span class="label">${label}</span><span class="value">${value}</span></div>`;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function createSummaryDialog(state: WorkoutState): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';
  overlay.innerHTML = `
    <div class="dialog">
      <h2>Workout Summary</h2>
      <div id="summary-rows"></div>
      <button class="btn btn-start" id="btn-dismiss">Done</button>
    </div>
  `;

  const rows = overlay.querySelector<HTMLElement>('#summary-rows')!;
  const btnDismiss = overlay.querySelector<HTMLButtonElement>('#btn-dismiss')!;

  btnDismiss.addEventListener('click', () => state.dismissSummary());

  state.subscribe(() => {
    const s = state.summary;
    if (s) {
      let html = row('Duration', formatTime(s.durationSeconds));
      html += row('Jump Time', formatTime(s.jumpTimeSeconds));
      if (s.jumpCount != null) html += row('Jumps', String(s.jumpCount));
      if (s.jumpsPerMinute != null) html += row('Jumps/min', s.jumpsPerMinute.toFixed(1));
      if (s.avgHeartRate != null) html += row('Avg HR', `${s.avgHeartRate} bpm`);
      rows.innerHTML = html;
      overlay.classList.add('open');
    } else {
      overlay.classList.remove('open');
    }
  });

  return overlay;
}
