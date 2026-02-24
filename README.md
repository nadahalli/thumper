# Thumper

**Try it now: [nadahalli.github.io/thumper-pwa](https://nadahalli.github.io/thumper-pwa/)** (Android + Chrome, add to homescreen for full PWA experience)

A minimal jump rope workout app with BLE heart rate monitoring and mic-based jump counting.

<p align="center">
  <img src="assets/thumper.jpg" alt="Thumper workout screen" width="300">
</p>

## Features

- **Heart rate monitoring** via any Bluetooth Low Energy HR strap
- **Jump counting** using the phone's microphone to detect rope impacts
- **Workout timer** with 5-second countdown, pause/resume
- **Workout summary** dialog after stopping (duration, avg HR, jumps, jumps per minute)
- **Workout history** stored locally with IndexedDB
- **TCX export** of individual or all workouts (compatible with Garmin, Strava, etc.)
- **Adjustable sensitivity** for jump detection threshold

## Requirements

- Android + Chrome (Web Bluetooth, Web Audio, Wake Lock)
- BLE-capable device (for heart rate)
- Microphone permission (for jump detection)

## Development

```
npm install
npm run dev
```

## Architecture

Vanilla TypeScript PWA, no framework. Vite + Dexie.js + vite-plugin-pwa.

```
src/
  main.ts                     Entry point, hash router, screen switching
  core/                       Pure logic (zero DOM, zero Web API deps)
    jump-analyzer.ts            Amplitude detection (threshold, cooldown, gap tracking)
    hr-parser.ts                BLE HR measurement byte parsing
    tcx-builder.ts              Garmin TCX XML generation
    summary.ts                  Workout summary computation
  api/                        Web API wrappers (thin adapters)
    audio.ts                    getUserMedia + ScriptProcessorNode
    bluetooth.ts                Web Bluetooth scan, connect, HR notifications
    wake-lock.ts                Screen Wake Lock API
  data/                       Persistence
    db.ts                       Dexie database (workouts + samples tables)
    types.ts                    Workout, WorkoutSample interfaces
  state/                      Reactive state
    workout-state.ts            Workout lifecycle state machine
  ui/                         DOM rendering
    workout-screen.ts           Main workout view
    history-screen.ts           Past workouts list
    components/                 Dialogs (summary, settings)
    styles.css                  Dark theme, big typography
```

## Testing

```
npm test
```

Pure business logic is extracted into framework-free modules for unit testing:

- `JumpAnalyzer` - amplitude threshold, cooldown, jump time accumulation, reset
- `HeartRateParser` - BLE heart rate byte parsing (8-bit, 16-bit)
- `WorkoutSummary` - avg HR, jump count, jumps-per-minute math
- `TcxBuilder` - TCX XML structure, timestamps, trackpoints
- `WorkoutState` - full workout lifecycle flow (countdown, active, pause, resume, stop, save, discard)

## Privacy

Thumper is entirely offline and makes zero network connections. All data stays on your device in IndexedDB.

## Tech

TypeScript, Vite, Dexie.js, Web Audio API, Web Bluetooth API, Screen Wake Lock API, vite-plugin-pwa.
