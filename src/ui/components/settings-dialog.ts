import type { WorkoutState } from '../../state/workout-state';

export function createSettingsDialog(state: WorkoutState): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';
  overlay.id = 'settings-dialog';
  overlay.innerHTML = `
    <div class="dialog">
      <h2>Settings</h2>
      <div class="setting-group">
        <label>Jump Sensitivity</label>
        <input type="range" id="sensitivity-slider" min="1000" max="20000" step="500">
        <div class="setting-value" id="sensitivity-value"></div>
      </div>
      <button class="btn btn-secondary btn-centered" id="btn-close-settings">Close</button>
    </div>
  `;

  const slider = overlay.querySelector<HTMLInputElement>('#sensitivity-slider')!;
  const valueDisplay = overlay.querySelector<HTMLElement>('#sensitivity-value')!;
  const btnClose = overlay.querySelector<HTMLButtonElement>('#btn-close-settings')!;

  slider.value = String(state.sensitivity);
  valueDisplay.textContent = String(state.sensitivity);

  slider.addEventListener('input', () => {
    const val = Number(slider.value);
    state.setSensitivity(val);
    valueDisplay.textContent = String(val);
  });

  btnClose.addEventListener('click', () => {
    overlay.classList.remove('open');
  });

  return overlay;
}

export function openSettingsDialog(): void {
  document.getElementById('settings-dialog')?.classList.add('open');
}
