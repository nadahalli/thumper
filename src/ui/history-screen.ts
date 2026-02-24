import { db } from '../data/db';
import { buildTcx } from '../core/tcx-builder';
import type { Workout } from '../data/types';

function formatDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportWorkout(workout: Workout): Promise<void> {
  const samples = await db.workout_samples.where('workoutId').equals(workout.id!).toArray();
  const tcx = buildTcx([workout], new Map([[workout.id!, samples]]));
  const d = new Date(workout.startTimeMillis);
  const pad = (n: number) => String(n).padStart(2, '0');
  const filename = `workout-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.tcx`;
  downloadFile(filename, tcx, 'application/vnd.garmin.tcx+xml');
}

async function exportAll(): Promise<void> {
  const workouts = await db.workouts.orderBy('startTimeMillis').reverse().toArray();
  if (workouts.length === 0) return;
  const allSamples = await db.workout_samples.toArray();
  const sampleMap = new Map<number, typeof allSamples>();
  for (const s of allSamples) {
    const arr = sampleMap.get(s.workoutId) ?? [];
    arr.push(s);
    sampleMap.set(s.workoutId, arr);
  }
  const tcx = buildTcx(workouts, sampleMap);
  downloadFile('workouts-export.tcx', tcx, 'application/vnd.garmin.tcx+xml');
}

function renderItem(workout: Workout): string {
  const date = formatDate(workout.startTimeMillis);
  const duration = formatTime(workout.durationSeconds);
  const parts: string[] = [duration];
  if (workout.jumpCount != null) parts.push(`${workout.jumpCount} jumps`);
  if (workout.avgHeartRate != null) parts.push(`${workout.avgHeartRate} avg bpm`);

  return `
    <div class="history-item" data-id="${workout.id}">
      <div class="history-info">
        <h3>${date}</h3>
        <p>${parts.join(' / ')}</p>
      </div>
      <div class="history-actions">
        <button class="btn-icon btn-export" data-id="${workout.id}">TCX</button>
        <button class="btn-icon btn-delete" data-id="${workout.id}">Del</button>
      </div>
    </div>
  `;
}

export function createHistoryScreen(container: HTMLElement): void {
  async function render(): Promise<void> {
    const workouts = await db.workouts.orderBy('startTimeMillis').reverse().toArray();

    if (workouts.length === 0) {
      container.innerHTML = '<div class="history-empty">No workouts yet. Start jumping!</div>';
      return;
    }

    container.innerHTML = `
      <div class="toolbar">
        <button class="btn-icon" id="btn-export-all">Export All</button>
      </div>
      <div class="history-list">
        ${workouts.map(renderItem).join('')}
      </div>
    `;

    container.querySelector('#btn-export-all')?.addEventListener('click', () => exportAll());

    for (const btn of container.querySelectorAll<HTMLButtonElement>('.btn-export')) {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.id);
        const w = workouts.find((w) => w.id === id);
        if (w) await exportWorkout(w);
      });
    }

    for (const btn of container.querySelectorAll<HTMLButtonElement>('.btn-delete')) {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.id);
        await db.workout_samples.where('workoutId').equals(id).delete();
        await db.workouts.delete(id);
        await render();
      });
    }
  }

  // Expose render for re-rendering when navigating to this screen
  (container as HTMLElement & { refresh?: () => void }).refresh = render;
  render();
}
