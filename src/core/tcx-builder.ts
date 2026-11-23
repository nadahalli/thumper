import type { Workout, WorkoutSample } from '../data/types';
import { buildLaps, lapHeartRate, toTrackPoints, type ExportLap, type TrackPoint } from './workout-laps';

function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildTrackpoint(p: TrackPoint): string {
  let xml = '          <Trackpoint>\n';
  xml += `            <Time>${toIso(p.timestampMillis)}</Time>\n`;
  if (p.heartRate != null) {
    xml += '            <HeartRateBpm>\n';
    xml += `              <Value>${p.heartRate}</Value>\n`;
    xml += '            </HeartRateBpm>\n';
  }
  if (p.cadence != null) {
    xml += `            <Cadence>${p.cadence}</Cadence>\n`;
  }
  xml += '          </Trackpoint>\n';
  return xml;
}

function buildLap(lap: ExportLap): string {
  const { avg, max } = lapHeartRate(lap);
  const durationSeconds = Math.round((lap.endMs - lap.startMs) / 1000);

  let xml = `      <Lap StartTime="${toIso(lap.startMs)}">\n`;
  xml += `        <TotalTimeSeconds>${durationSeconds}</TotalTimeSeconds>\n`;
  if (avg != null) {
    xml += `        <AverageHeartRateBpm><Value>${avg}</Value></AverageHeartRateBpm>\n`;
  }
  if (max != null) {
    xml += `        <MaximumHeartRateBpm><Value>${max}</Value></MaximumHeartRateBpm>\n`;
  }
  xml += `        <Intensity>${lap.kind === 'active' ? 'Active' : 'Resting'}</Intensity>\n`;
  if (lap.kind === 'active') {
    xml += `        <Notes>${escapeXml(`${lap.jumps} jumps`)}</Notes>\n`;
  }
  xml += '        <Track>\n';
  for (const p of lap.points) {
    xml += buildTrackpoint(p);
  }
  xml += '        </Track>\n';
  xml += '      </Lap>\n';
  return xml;
}

export function buildTcx(
  workouts: Workout[],
  samplesByWorkout: Map<number, WorkoutSample[]>,
): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml +=
    '<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">\n';
  xml += '  <Activities>\n';

  for (const w of workouts) {
    const startTime = toIso(w.startTimeMillis);
    const samples = samplesByWorkout.get(w.id!) ?? [];

    xml += `    <Activity Sport="Other">\n`;
    xml += `      <Id>${startTime}</Id>\n`;

    if (w.sets && w.sets.length > 0) {
      for (const lap of buildLaps(w, samples)) {
        xml += buildLap(lap);
      }
    } else {
      // Legacy single-lap fallback
      xml += `      <Lap StartTime="${startTime}">\n`;
      xml += `        <TotalTimeSeconds>${w.durationSeconds}</TotalTimeSeconds>\n`;
      if (w.jumpTimeSeconds != null) {
        xml += `        <Notes>${escapeXml(`Jump time: ${w.jumpTimeSeconds}s`)}</Notes>\n`;
      }
      xml += '        <Track>\n';
      for (const p of toTrackPoints(samples)) {
        xml += buildTrackpoint(p);
      }
      xml += '        </Track>\n';
      xml += '      </Lap>\n';
    }

    xml += '    </Activity>\n';
  }

  xml += '  </Activities>\n';
  xml += '</TrainingCenterDatabase>\n';
  return xml;
}
