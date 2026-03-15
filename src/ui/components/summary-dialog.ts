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
      <div class="summary-buttons" id="summary-main-buttons">
        <button class="btn btn-start" id="btn-save">Save</button>
        <button class="btn btn-stop" id="btn-discard">Discard</button>
      </div>
      <div class="summary-buttons" id="summary-confirm-buttons" style="display:none">
        <p class="confirm-text">Are you sure? This workout will be lost.</p>
        <button class="btn btn-stop" id="btn-confirm-discard">Discard</button>
        <button class="btn btn-secondary" id="btn-cancel-discard">Cancel</button>
      </div>
    </div>
  `;

  const rows = overlay.querySelector<HTMLElement>('#summary-rows')!;
  const mainButtons = overlay.querySelector<HTMLElement>('#summary-main-buttons')!;
  const confirmButtons = overlay.querySelector<HTMLElement>('#summary-confirm-buttons')!;

  overlay.querySelector('#btn-save')!.addEventListener('click', () => state.saveWorkout());

  overlay.querySelector('#btn-discard')!.addEventListener('click', () => {
    mainButtons.style.display = 'none';
    confirmButtons.style.display = '';
  });

  overlay.querySelector('#btn-confirm-discard')!.addEventListener('click', () => {
    confirmButtons.style.display = 'none';
    mainButtons.style.display = '';
    state.discardWorkout();
  });

  overlay.querySelector('#btn-cancel-discard')!.addEventListener('click', () => {
    confirmButtons.style.display = 'none';
    mainButtons.style.display = '';
  });

  state.subscribe(() => {
    const s = state.summary;
    if (s) {
      let html = row('Duration', formatTime(s.durationSeconds));
      html += row('Jump Time', formatTime(s.jumpTimeSeconds));
      if (s.jumpCount != null) html += row('Jumps', String(s.jumpCount));
      if (s.jumpsPerMinute != null) html += row('Jumps/min', s.jumpsPerMinute.toFixed(1));
      if (s.avgHeartRate != null) html += row('Avg HR', `${s.avgHeartRate} bpm`);
      if (s.topStreaks.length > 0) {
        html += `<div class="streaks-section"><div class="streaks-label">Longest Streaks</div>`;
        for (const streak of s.topStreaks) {
          html += row(`${streak.jumps} jumps`, formatTime(Math.round(streak.durationMs / 1000)));
        }
        html += `</div>`;
      }
      rows.innerHTML = html;
      // Reset to main buttons view
      mainButtons.style.display = '';
      confirmButtons.style.display = 'none';
      overlay.classList.add('open');
    } else {
      overlay.classList.remove('open');
    }
  });

  return overlay;
}
