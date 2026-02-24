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
