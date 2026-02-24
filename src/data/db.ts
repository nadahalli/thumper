import Dexie, { type EntityTable } from 'dexie';
import type { Workout, WorkoutSample } from './types';

const db = new Dexie('ThumperDB') as Dexie & {
  workouts: EntityTable<Workout, 'id'>;
  workout_samples: EntityTable<WorkoutSample, 'id'>;
};

db.version(1).stores({
  workouts: '++id, startTimeMillis',
  workout_samples: '++id, workoutId, timestampMillis',
});

export { db };
