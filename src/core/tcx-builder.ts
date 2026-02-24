import type { Workout, WorkoutSample } from '../data/types';

function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
    xml += `    <Activity Sport="Other">\n`;
    xml += `      <Id>${startTime}</Id>\n`;
    xml += `      <Lap StartTime="${startTime}">\n`;
    xml += `        <TotalTimeSeconds>${w.durationSeconds}</TotalTimeSeconds>\n`;

    if (w.jumpTimeSeconds != null) {
      xml += `        <Notes>${escapeXml(`Jump time: ${w.jumpTimeSeconds}s`)}</Notes>\n`;
    }

    xml += '        <Track>\n';
    const samples = samplesByWorkout.get(w.id!) ?? [];
    for (const s of samples) {
      xml += '          <Trackpoint>\n';
      xml += `            <Time>${toIso(s.timestampMillis)}</Time>\n`;
      if (s.heartRate != null) {
        xml += '            <HeartRateBpm>\n';
        xml += `              <Value>${s.heartRate}</Value>\n`;
        xml += '            </HeartRateBpm>\n';
      }
      xml += '          </Trackpoint>\n';
    }
    xml += '        </Track>\n';
    xml += '      </Lap>\n';
    xml += '    </Activity>\n';
  }

  xml += '  </Activities>\n';
  xml += '</TrainingCenterDatabase>\n';
  return xml;
}
