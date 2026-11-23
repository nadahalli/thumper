import {
  Encoder,
  Profile,
  type ActivityMesg,
  type EventMesg,
  type FileIdMesg,
  type HrvMesg,
  type LapMesg,
  type Mesg,
  type RecordMesg,
  type SessionMesg,
} from '@garmin/fitsdk';
import type { Workout, WorkoutSample } from '../data/types';
import { buildLaps, lapHeartRate } from './workout-laps';

/** FIT hrv messages hold up to five RR intervals each. */
const HRV_VALUES_PER_MESG = 5;

/**
 * Build a FIT activity file with sport=jumpRope, so Garmin Connect files it as
 * Jump Rope and reads the jump count from totalCycles. RR intervals go into
 * hrv messages.
 */
export function buildFit(workout: Workout, samples: WorkoutSample[]): Uint8Array {
  const laps = buildLaps(workout, samples);
  const startMs = Math.min(workout.startTimeMillis, ...laps.map((l) => l.startMs));
  const endMs = Math.max(...laps.map((l) => l.endMs), ...samples.map((s) => s.timestampMillis));
  const timerSeconds = laps.reduce((sum, l) => sum + (l.endMs - l.startMs) / 1000, 0);
  const totalJumps = laps.reduce((sum, l) => sum + l.jumps, 0);
  const allHr = samples.map((s) => s.heartRate).filter((h): h is number => h != null);

  const enc = new Encoder();
  // Typed wrapper: onMesg() only knows the base Mesg type.
  const put = <T extends Mesg>(mesgNum: number, mesg: T) => enc.onMesg(mesgNum, mesg);
  put<FileIdMesg>(Profile.MesgNum.FILE_ID, {
    type: 'activity',
    manufacturer: 'development',
    product: 0,
    timeCreated: new Date(startMs),
  });
  put<EventMesg>(Profile.MesgNum.EVENT, {
    timestamp: new Date(startMs),
    event: 'timer',
    eventType: 'start',
  });

  laps.forEach((lap, i) => {
    for (const p of lap.points) {
      put<RecordMesg>(Profile.MesgNum.RECORD, {
        timestamp: new Date(p.timestampMillis),
        heartRate: p.heartRate ?? undefined,
        cadence: p.cadence ?? undefined,
      });
      for (let k = 0; k < p.rrIntervalsMs.length; k += HRV_VALUES_PER_MESG) {
        const time: (number | null)[] = p.rrIntervalsMs
          .slice(k, k + HRV_VALUES_PER_MESG)
          .map((ms) => ms / 1000);
        // Pad to a fixed five slots like Garmin devices do; the encoder writes null as invalid.
        while (time.length < HRV_VALUES_PER_MESG) time.push(null);
        put<HrvMesg>(Profile.MesgNum.HRV, { time: time as number[] });
      }
    }

    const seconds = (lap.endMs - lap.startMs) / 1000;
    const { avg, max } = lapHeartRate(lap);
    put<LapMesg>(Profile.MesgNum.LAP, {
      messageIndex: i,
      timestamp: new Date(lap.endMs),
      startTime: new Date(lap.startMs),
      totalElapsedTime: seconds,
      totalTimerTime: seconds,
      totalCycles: lap.jumps,
      avgCadence: lap.kind === 'active' && seconds > 0 ? Math.round((lap.jumps * 60) / seconds) : undefined,
      avgHeartRate: avg ?? undefined,
      maxHeartRate: max ?? undefined,
      intensity: lap.kind,
      sport: 'jumpRope',
      subSport: 'generic',
      event: 'lap',
      eventType: 'stop',
      lapTrigger: 'manual',
    });
  });

  put<EventMesg>(Profile.MesgNum.EVENT, {
    timestamp: new Date(endMs),
    event: 'timer',
    eventType: 'stopAll',
  });
  put<SessionMesg>(Profile.MesgNum.SESSION, {
    messageIndex: 0,
    timestamp: new Date(endMs),
    startTime: new Date(startMs),
    totalElapsedTime: (endMs - startMs) / 1000,
    totalTimerTime: timerSeconds,
    totalCycles: totalJumps,
    avgHeartRate: workout.avgHeartRate ?? undefined,
    maxHeartRate: allHr.length > 0 ? Math.max(...allHr) : undefined,
    sport: 'jumpRope',
    subSport: 'generic',
    firstLapIndex: 0,
    numLaps: laps.length,
    event: 'session',
    eventType: 'stop',
    trigger: 'activityEnd',
  });
  put<ActivityMesg>(Profile.MesgNum.ACTIVITY, {
    timestamp: new Date(endMs),
    totalTimerTime: timerSeconds,
    numSessions: 1,
    type: 'manual',
    event: 'activity',
    eventType: 'stop',
  });

  return enc.close();
}
