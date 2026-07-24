import { WorkoutState } from './state/workout-state';
import { createWorkoutScreen } from './ui/workout-screen';
import { createHistoryScreen } from './ui/history-screen';
import { createSummaryDialog } from './ui/components/summary-dialog';
import { createSettingsDialog, openSettingsDialog } from './ui/components/settings-dialog';
import './ui/styles.css';

const state = new WorkoutState();

const app = document.getElementById('app')!;
app.innerHTML = `
  <nav>
    <a href="#workout" class="active" data-screen="workout">Workout</a>
    <a href="#history" data-screen="history">History</a>
  </nav>
  <div class="screen visible" id="screen-workout"></div>
  <div class="screen" id="screen-history"></div>
`;

const workoutScreen = document.getElementById('screen-workout')!;
const historyScreen = document.getElementById('screen-history')! as HTMLElement & { refresh?: () => void };
const navLinks = app.querySelectorAll<HTMLAnchorElement>('nav a');

createWorkoutScreen(workoutScreen, state, openSettingsDialog);
createHistoryScreen(historyScreen);

// Dialogs
app.appendChild(createSummaryDialog(state));
app.appendChild(createSettingsDialog(state));

// Hash routing
function navigate(): void {
  const hash = location.hash || '#workout';
  const screens = app.querySelectorAll<HTMLElement>('.screen');
  screens.forEach((s) => s.classList.remove('visible'));

  navLinks.forEach((a) => {
    a.classList.toggle('active', `#${a.dataset.screen}` === hash);
  });

  if (hash === '#history') {
    historyScreen.classList.add('visible');
    historyScreen.refresh?.();
  } else {
    workoutScreen.classList.add('visible');
  }
}

window.addEventListener('hashchange', navigate);
navigate();

// The injected registerSW.js only checks for a new service worker at page
// load, and an installed PWA is rarely relaunched, so deploys take forever
// to land. Poll for updates, and when a new worker takes control reload the
// page, but never in the middle of a workout.
if ('serviceWorker' in navigator) {
  const checkForUpdate = () => {
    void navigator.serviceWorker.getRegistration().then((r) => r?.update());
  };
  setInterval(checkForUpdate, 60_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });

  let hadController = navigator.serviceWorker.controller != null;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // First controller on a fresh install is not an update
    if (!hadController) {
      hadController = true;
      return;
    }
    if (state.phase === 'idle' || state.phase === 'stopped') {
      location.reload();
    }
  });
}
