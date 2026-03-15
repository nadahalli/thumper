import type { Workout, WorkoutSample, WorkoutSet } from '../data/types';

function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildTrackpoint(s: WorkoutSample): string {
  let xml = '          <Trackpoint>\n';
  xml += `            <Time>${toIso(s.timestampMillis)}</Time>\n`;
  if (s.heartRate != null) {
    xml += '            <HeartRateBpm>\n';
    xml += `              <Value>${s.heartRate}</Value>\n`;
    xml += '            </HeartRateBpm>\n';
  }
  xml += '          </Trackpoint>\n';
  return xml;
}

function buildSetLap(set: WorkoutSet, allSamples: WorkoutSample[]): string {
  const lapSamples = allSamples.filter(
    (s) => s.timestampMillis >= set.startMs && s.timestampMillis <= set.endMs,
  );
  const hrValues = lapSamples
    .map((s) => s.heartRate)
    .filter((hr): hr is number => hr != null);
  const avgHr =
    hrValues.length > 0
      ? Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length)
      : null;
  const maxHr = hrValues.length > 0 ? Math.max(...hrValues) : null;
  const durationSeconds = Math.round((set.endMs - set.startMs) / 1000);

  let xml = `      <Lap StartTime="${toIso(set.startMs)}">\n`;
  xml += `        <TotalTimeSeconds>${durationSeconds}</TotalTimeSeconds>\n`;
  if (avgHr != null) {
    xml += `        <AverageHeartRateBpm><Value>${avgHr}</Value></AverageHeartRateBpm>\n`;
  }
  if (maxHr != null) {
    xml += `        <MaximumHeartRateBpm><Value>${maxHr}</Value></MaximumHeartRateBpm>\n`;
  }
  xml += `        <Intensity>Active</Intensity>\n`;
  xml += `        <Notes>${escapeXml(`${set.jumps} jumps`)}</Notes>\n`;
  xml += '        <Track>\n';
  for (const s of lapSamples) {
    xml += buildTrackpoint(s);
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
      for (const set of w.sets) {
        xml += buildSetLap(set, samples);
      }
    } else {
      // Legacy single-lap fallback
      xml += `      <Lap StartTime="${startTime}">\n`;
      xml += `        <TotalTimeSeconds>${w.durationSeconds}</TotalTimeSeconds>\n`;
      if (w.jumpTimeSeconds != null) {
        xml += `        <Notes>${escapeXml(`Jump time: ${w.jumpTimeSeconds}s`)}</Notes>\n`;
      }
      xml += '        <Track>\n';
      for (const s of samples) {
        xml += buildTrackpoint(s);
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
