import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { createRenderingBackend } from '../../src/rendering/babylon';
import { createDefaultSettings } from '../../src/settings';
import { createKeyboardFilter } from '../../src/vehicles';
import { VEHICLE_CLASSES, tractiveForceN } from '../../src/vehicles';
import { bindKeyboardDriveInput } from '../../src/input';
import { evaluateStopPolicy } from '../../src/autonomy';
import {
  PLAYTEST_DURATION_TICKS,
  PLAYTEST_TICK_HZ,
  buildPlaytestExport,
  createPlaytestBaseProfile,
  createPlaytestRecorder,
  evaluatePlaytestDrive,
} from '../harness/early-playtest-session';
import type {
  PlaytestAnswers,
  PlaytestAutoSample,
  PlaytestDrive,
  PlaytestFinishReason,
  PlaytestMode,
  PlaytestRecorder,
  PlaytestResult,
} from '../harness/early-playtest-session';

/**
 * PBI 204 stage 4 interactive playtest page.
 *
 * Real pieces: keyboard input through 025's keyboard filter and bindings, the 085-style tick
 * samples produced by the pure playtest recorder, 093 evidence, 094/095/098 estimators,
 * composeEarlyLoopProfile, compileEarlyLoopControllerProfiles and 051 stop decisions in AUTO.
 *
 * Documented simplifications: the road is a straight corridor, the ego uses a kinematic
 * longitudinal/lateral integrator instead of Rapier, the other three taxis and two civilians are
 * visual actors without collision or emergent traffic, and AUTO consumes the compiled 046/047/051
 * values directly rather than running the full 044/045 road-context stack. The page never writes
 * to localStorage or the network.
 */

const CANVAS_ID = 'stage';
const POSTED_LIMIT_MPS = 10;
const ROAD_LENGTH_M = 12_000;
const STOP_LINE_SPACING_M = 180;
const FIRST_STOP_LINE_M = 200;
const STOP_LINE_COUNT = 54;
const CRUISE_TARGET_MPS = 11;
const ROAD_HALF_WIDTH_M = 3.1;
const DRIVE_TICK_SECONDS = 1 / PLAYTEST_TICK_HZ;

interface StopLine {
  readonly id: string;
  readonly z: number;
}

const stopLines: readonly StopLine[] = Object.freeze(
  Array.from({ length: STOP_LINE_COUNT }, (_, index) =>
    Object.freeze({
      id: `stop-line-${String(index + 1).padStart(2, '0')}`,
      z: FIRST_STOP_LINE_M + index * STOP_LINE_SPACING_M,
    }),
  ),
);

const settings = createDefaultSettings('204-playtest');
const context = Object.freeze({
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: '204-playtest-browser',
  worldEpoch: 1,
});
const actor = Object.freeze({ id: 'taxi-01', incarnation: 1 });
const keyboard = createKeyboardFilter(context, 'taxi-01', settings.input.control);

const $ = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
};

const slotSelect = $<HTMLSelectElement>('slot');
const slotDevOption = $<HTMLOptionElement>('slot-dev');
const modeSelect = $<HTMLSelectElement>('mode');
const startButton = $<HTMLButtonElement>('start');
const startStatus = $<HTMLParagraphElement>('start-status');
const startPanel = $<HTMLElement>('start-panel');
const drivePanel = $<HTMLElement>('drive-panel');
const resultPanel = $<HTMLElement>('result-panel');
const canvas = $<HTMLCanvasElement>(CANVAS_ID);
const finishButton = $<HTMLButtonElement>('finish');
const driveStatus = $<HTMLParagraphElement>('drive-status');
const sessionMode = $<HTMLParagraphElement>('session-mode');
const hudMode = $<HTMLElement>('hud-mode');
const hudTimer = $<HTMLElement>('hud-timer');
const hudSpeed = $<HTMLElement>('hud-speed');
const hudStop = $<HTMLElement>('hud-stop');
const meterSpeed = $<HTMLElement>('meter-speed');
const meterAccel = $<HTMLElement>('meter-accel');
const meterStop = $<HTMLElement>('meter-stop');
const autoStatus = $<HTMLParagraphElement>('auto-status');
const observedList = $<HTMLUListElement>('observed-list');
const changeBody = $<HTMLTableSectionElement>('change-body');
const unchangedCallout = $<HTMLDivElement>('unchanged-callout');
const unchangedList = $<HTMLUListElement>('unchanged-list');
const manualProof = $<HTMLDivElement>('manual-proof');
const questionnaire = $<HTMLElement>('questionnaire');
const noticedSelect = $<HTMLSelectElement>('noticed');
const distinguishSelect = $<HTMLSelectElement>('distinguish');
const supportSelect = $<HTMLSelectElement>('support');
const freeText = $<HTMLTextAreaElement>('free-text');
const exportButton = $<HTMLButtonElement>('export');
const exportStatus = $<HTMLParagraphElement>('export-status');

const developerQuery = new URLSearchParams(window.location.search).has('selftest');
if (developerQuery) slotDevOption.hidden = false;

type Phase = 'loading' | 'idle' | 'driving' | 'finished';
let phase: Phase = 'loading';
let mode: PlaytestMode = 'LEARNING';
let selectedSlot = '';
let sessionId = '204-playtest-browser';
let recorder: PlaytestRecorder | null = null;
let drive: PlaytestDrive | null = null;
let result: PlaytestResult | null = null;
let startedAt = '';
let finishedAt = '';
let finishedBy: PlaytestFinishReason = 'finish';
let tick = 0;
let lineIndex = 0;
let throttle = 0;
let brake = 0;
let steering = 0;
let speedMps = 0;
let lateral = 0;
let z = 0;
let autoActive = false;
let autoDecision = 'AUTO · croazieră';
let autoStopRequested = false;
let autoHeldTicks = 0;
let autoLineIndex = 0;
let autoLineId: string | null = null;
let autoOpportunityId = '';
const autoOccurrences = new Map<string, number>();
const autoDemo: PlaytestAutoSample[] = [];

interface SelfTestState {
  active: boolean;
  dwelling: boolean;
  committed: boolean;
  dwellTicks: number;
  heldThrottle: boolean;
  heldBrake: boolean;
  fallbacks: number;
}
const selfTest: SelfTestState = {
  active: false,
  dwelling: false,
  committed: false,
  dwellTicks: 0,
  heldThrottle: false,
  heldBrake: false,
  fallbacks: 0,
};

const baseProfile = createPlaytestBaseProfile();
let backend: Awaited<ReturnType<typeof createRenderingBackend>> | null = null;
let egoMesh: ReturnType<typeof MeshBuilder.CreateBox> | null = null;
let camera: FreeCamera | null = null;
let keyboardBinding: ReturnType<typeof bindKeyboardDriveInput> | null = null;

function setText(element: HTMLElement, value: string): void {
  element.textContent = value;
}

function fmt(value: number, digits = 2): string {
  return value.toFixed(digits);
}

function remainingLabel(ticks: number): string {
  const remaining = Math.max(0, PLAYTEST_DURATION_TICKS - ticks);
  const totalSeconds = Math.ceil(remaining / PLAYTEST_TICK_HZ);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function nextLine(): StopLine | undefined {
  return stopLines[lineIndex];
}

function distanceToLine(line: StopLine | undefined): number | null {
  return line === undefined ? null : line.z - z;
}

function resetCar(): void {
  tick = 0;
  lineIndex = 0;
  throttle = 0;
  brake = 0;
  steering = 0;
  speedMps = 0;
  lateral = 0;
  z = 0;
  autoActive = false;
  autoDecision = 'AUTO · croazieră';
  autoStopRequested = false;
  autoHeldTicks = 0;
  autoLineIndex = 0;
  autoLineId = null;
  autoOpportunityId = '';
  autoOccurrences.clear();
  autoDemo.length = 0;
  selfTest.active = false;
  selfTest.dwelling = false;
  selfTest.committed = false;
  selfTest.dwellTicks = 0;
  selfTest.heldThrottle = false;
  selfTest.heldBrake = false;
  keyboard.clear();
  if (egoMesh) {
    egoMesh.position.x = 0;
    egoMesh.position.z = 0;
    egoMesh.rotation.y = 0;
  }
}

function updateProgress(): void {
  if (!recorder) return;
  const progress = recorder.progress();
  const learning = mode === 'LEARNING';
  const speedCount = learning ? Math.min(progress.freeWindows, 1) : 0;
  const accelCount = learning ? Math.min(progress.accelerationEpisodes, 3) : 0;
  const stopCount = learning ? Math.min(progress.stopEpisodes, 3) : 0;
  meterSpeed.className = `meter ${speedCount >= 1 ? 'ok' : 'wait'}`;
  meterAccel.className = `meter ${accelCount >= 3 ? 'ok' : 'wait'}`;
  meterStop.className = `meter ${stopCount >= 3 ? 'ok' : 'wait'}`;
  meterSpeed.querySelector('b')!.textContent = `${speedCount} / 1`;
  meterAccel.querySelector('b')!.textContent = `${accelCount} / 3`;
  meterStop.querySelector('b')!.textContent = `${stopCount} / 3`;
}

function elapsedLabel(ticks: number): string {
  const totalSeconds = Math.floor(ticks / PLAYTEST_TICK_HZ);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updateHud(): void {
  if (phase === 'finished') {
    hudMode.textContent = autoActive ? 'AUTO' : mode;
    hudTimer.textContent = elapsedLabel(tick);
  } else {
    hudMode.textContent = mode;
    hudTimer.textContent = remainingLabel(tick);
  }
  hudSpeed.textContent = String(Math.round(speedMps * 3.6));
  const line = nextLine();
  hudStop.textContent =
    phase === 'finished' && autoActive
      ? autoDecision
      : line === undefined
        ? 'fără STOP'
        : `${Math.max(0, Math.round(line.z - z))} m până la STOP`;
}

function dispatchDriveKey(action: 'throttle' | 'brake', pressed: boolean): void {
  const code = settings.input.bindings[action];
  const before = keyboard.getStats().heldKeys;
  document.dispatchEvent(
    new KeyboardEvent(pressed ? 'keydown' : 'keyup', {
      code,
      bubbles: true,
      cancelable: true,
    }),
  );
  if (keyboard.getStats().heldKeys === before) {
    // The real binding refuses input when its document is not focused. The developer self-test
    // records this fallback instead of pretending a synthetic event reached the filter.
    keyboard.setAction(action, pressed);
    selfTest.fallbacks += 1;
  }
}

function setSelfTestHeld(action: 'throttle' | 'brake', pressed: boolean): void {
  if (action === 'throttle') {
    if (selfTest.heldThrottle === pressed) return;
    selfTest.heldThrottle = pressed;
  } else {
    if (selfTest.heldBrake === pressed) return;
    selfTest.heldBrake = pressed;
  }
  dispatchDriveKey(action, pressed);
}

function selfTestStep(): void {
  const line = nextLine();
  const distance = distanceToLine(line);
  let desired = CRUISE_TARGET_MPS;
  if (line && !selfTest.committed) {
    const brakingDistance = (speedMps * speedMps) / (2 * 7.5) + 4;
    if (selfTest.dwelling || (distance !== null && distance <= brakingDistance)) desired = 0;
  }
  let wantThrottle = speedMps < desired - 0.25;
  let wantBrake = speedMps > desired + 0.25;
  if (selfTest.dwelling) {
    wantThrottle = false;
    wantBrake = true;
    selfTest.dwellTicks += 1;
    if (selfTest.dwellTicks >= 120) {
      selfTest.dwelling = false;
      selfTest.committed = true;
      selfTest.dwellTicks = 0;
    }
  }
  setSelfTestHeld('throttle', wantThrottle);
  setSelfTestHeld('brake', wantBrake);
  if (
    !selfTest.dwelling &&
    !selfTest.committed &&
    line &&
    speedMps <= 0.15 &&
    distance !== null &&
    distance <= 8 &&
    distance >= -1
  ) {
    selfTest.dwelling = true;
    selfTest.dwellTicks = 0;
  }
}

function integrate(maxAcceleration: number, maxDeceleration: number): void {
  const acceleration = throttle * maxAcceleration - brake * maxDeceleration - 0.02 * speedMps;
  speedMps = Math.max(0, Math.min(30, speedMps + acceleration * DRIVE_TICK_SECONDS));
  const steeringAuthority = Math.min(1, speedMps / 8) * 0.15;
  lateral = Math.max(
    -ROAD_HALF_WIDTH_M,
    Math.min(
      ROAD_HALF_WIDTH_M,
      lateral + steering * steeringAuthority * speedMps * DRIVE_TICK_SECONDS,
    ),
  );
  z += speedMps * DRIVE_TICK_SECONDS;
}

function advanceStopLine(): string | null {
  let crossed: string | null = null;
  while (lineIndex < stopLines.length && z >= stopLines[lineIndex]!.z) {
    crossed = stopLines[lineIndex]!.id;
    lineIndex += 1;
    selfTest.committed = false;
  }
  return crossed;
}

function manualStep(): void {
  if (selfTest.active) selfTestStep();
  keyboardBinding?.sync();
  const frame = keyboard.step({
    tick: tick + 1,
    dtSeconds: DRIVE_TICK_SECONDS,
    speedMps,
  });
  throttle = frame.command.throttle;
  brake = frame.command.brake;
  steering = frame.command.steering;
  const previousSpeed = speedMps;
  const config = VEHICLE_CLASSES.sedan;
  integrate(tractiveForceN(config, speedMps) / config.massKg, config.brakeAcceleration);
  tick += 1;
  const crossed = advanceStopLine();
  const line = nextLine();
  recorder?.record({
    tick,
    throttle,
    brake,
    steering,
    speedMps,
    accelerationMps2: (speedMps - previousSpeed) * PLAYTEST_TICK_HZ,
    distanceToStopLineM: distanceToLine(line),
    stopLineId: line?.id ?? null,
    crossedStopLineId: crossed,
    postedLimitMps: POSTED_LIMIT_MPS,
  });
}

function autoStep(): void {
  if (!result) return;
  const tokens = result.tokens;
  const targetSpeed = Math.max(
    0,
    Math.min(25, POSTED_LIMIT_MPS + tokens.cruise.values.speed_delta_urban),
  );
  const line = stopLines[autoLineIndex];
  let requestedSpeed = targetSpeed;
  if (line !== undefined) {
    if (autoLineId !== line.id) {
      autoLineId = line.id;
      const occurrence = (autoOccurrences.get(line.id) ?? 0) + 1;
      autoOccurrences.set(line.id, occurrence);
      autoOpportunityId = `auto-${line.id}-${occurrence}`;
      autoHeldTicks = 0;
    }
    const distance = line.z - z;
    if (distance >= -1 && distance <= 80) {
      const decision = evaluateStopPolicy({
        sessionId: context.sessionId,
        worldEpoch: context.worldEpoch,
        actor,
        decisionTick: tick + 1,
        seed: 1,
        profile: tokens.stop,
        observation: {
          version: '051-stop-observation-v1',
          units: 'SI',
          tick: tick + 1,
          opportunityId: autoOpportunityId,
          stopLineId: line.id,
          distanceToStopLineM: Math.max(0, distance),
          speedMps,
          stationaryDurationS:
            speedMps <= 0.15 ? Math.min(60, autoHeldTicks / PLAYTEST_TICK_HZ) : null,
          crossed: distance < 0,
        },
        leaderStop: 'NONE',
      });
      autoDecision = `${decision.action}/${decision.reason}`;
      autoStopRequested = decision.stopRequested;
      if (decision.stopRequested) {
        if (decision.action === 'APPROACH') {
          const remaining = Math.max(0, decision.remainingToStopPointM ?? Math.max(0, distance));
          requestedSpeed = Math.min(
            targetSpeed,
            Math.sqrt(2 * tokens.longitudinal.values.comfort_deceleration * remaining) * 0.7,
          );
        } else {
          requestedSpeed = 0;
        }
      }
    } else if (distance > 80) {
      autoDecision = 'AUTO · croazieră';
      autoStopRequested = false;
    }
    if (distance < 0) {
      autoLineIndex += 1;
      autoLineId = null;
      autoHeldTicks = 0;
      autoStopRequested = false;
    }
  } else {
    autoDecision = 'AUTO · capăt de traseu';
    autoStopRequested = false;
  }
  if (speedMps < requestedSpeed - 0.15) {
    throttle = Math.max(0.1, Math.min(1, (requestedSpeed - speedMps) / 2));
    brake = 0;
  } else if (speedMps > requestedSpeed + 0.15) {
    throttle = 0;
    brake = Math.max(0.1, Math.min(1, (speedMps - requestedSpeed) / 2));
  } else {
    throttle = 0;
    brake = 0;
  }
  steering = 0;
  integrate(
    tokens.longitudinal.values.desired_acceleration,
    tokens.longitudinal.values.comfort_deceleration,
  );
  tick += 1;
  const crossed = advanceStopLine();
  if (crossed !== null) {
    autoLineIndex = Math.max(autoLineIndex, lineIndex);
    autoLineId = null;
    autoHeldTicks = 0;
  }
  if (speedMps <= 0.15) autoHeldTicks += 1;
  else autoHeldTicks = 0;
  if (tick % 12 === 0 && autoDemo.length < 600)
    autoDemo.push(
      Object.freeze({
        tick,
        speedMps,
        decision: autoDecision,
        stopRequested: autoStopRequested,
      }),
    );
}

function step(): void {
  if (phase === 'driving') {
    manualStep();
    updateProgress();
    if (tick >= PLAYTEST_DURATION_TICKS) finishSession('timer');
    else if (
      selfTest.active &&
      recorder !== null &&
      lineIndex >= 3 &&
      recorder.progress().stopEpisodes >= 3
    )
      finishSession('developer');
  } else if (phase === 'finished' && autoActive) {
    try {
      autoStep();
    } catch (error) {
      autoActive = false;
      driveStatus.textContent = `AUTO s-a oprit: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  }
  if (phase !== 'idle') updateHud();
}

function startSession(): void {
  if (phase !== 'idle') return;
  selectedSlot = slotSelect.value;
  if (selectedSlot === '') {
    startStatus.textContent = 'Alegeți slotul anonim înainte de start.';
    return;
  }
  if (selectedSlot === 'dev' && !developerQuery) {
    startStatus.textContent = 'Slotul de self-test este disponibil doar cu ?selftest=1.';
    return;
  }
  mode = modeSelect.value === 'MANUAL' ? 'MANUAL' : 'LEARNING';
  sessionId = `204-playtest-${new Date().toISOString()}`;
  recorder = createPlaytestRecorder({
    mode,
    sessionId,
    vehicleId: actor.id,
    incarnation: `taxi-01-inc-${actor.incarnation}`,
    classId: 'sedan',
  });
  drive = null;
  result = null;
  startedAt = new Date().toISOString();
  finishedAt = '';
  finishedBy = 'finish';
  resetCar();
  phase = 'driving';
  startPanel.hidden = true;
  drivePanel.hidden = false;
  resultPanel.hidden = true;
  questionnaire.hidden = true;
  autoStatus.className = 'callout';
  exportStatus.textContent = '';
  sessionMode.textContent =
    mode === 'LEARNING'
      ? 'LEARNING · comenzi reale, dovezi 085/093 și profil învățat la final.'
      : 'MANUAL · comenzile sunt înregistrate, dar nicio dovadă de învățare nu este produsă.';
  hudMode.textContent = mode;
  driveStatus.textContent =
    mode === 'LEARNING'
      ? 'Înregistrare LEARNING. Conduceți natural până la 05:00 sau apăsați „Termină”.'
      : 'Înregistrare MANUAL. Conduceți natural; la final veți vedea că nu s-a învățat nimic.';
  updateProgress();
  updateHud();
  canvas.focus();
  window.focus();
}

function finishSession(reason: PlaytestFinishReason): void {
  if (phase !== 'driving' || recorder === null) return;
  drive = recorder.finish();
  result = evaluatePlaytestDrive(drive, baseProfile);
  phase = 'finished';
  finishedAt = new Date().toISOString();
  finishedBy = reason;
  autoActive = result.mode === 'LEARNING';
  autoLineIndex = lineIndex;
  autoLineId = null;
  autoHeldTicks = 0;
  autoOccurrences.clear();
  if (autoActive) {
    autoStatus.textContent =
      'AUTO este acum activ pe aceeași mașină. Conduce cu valorile compilate din profilul învățat (046 viteză, 047 accelerație, 051 STOP). Urmăriți decizia STOP din HUD.';
    autoStatus.className = 'callout ok';
  } else {
    autoStatus.textContent =
      'AUTO nu a fost activat. MANUAL nu a produs niciun profil învățat și niciun token AUTO; mașina rămâne pe profilul de bază.';
    autoStatus.className = 'callout bad';
  }
  renderResult(result, drive);
  resultPanel.hidden = false;
  questionnaire.hidden = false;
  finishButton.disabled = true;
  driveStatus.textContent =
    reason === 'timer'
      ? 'Sesiunea de 5 minute s-a încheiat. Rezultatul este afișat mai jos.'
      : 'Sesiunea a fost încheiată. Rezultatul este afișat mai jos.';
  updateHud();
  resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderResult(current: PlaytestResult, currentDrive: PlaytestDrive): void {
  observedList.replaceChildren();
  const observed = current.observed;
  for (const text of [
    `Durată: ${fmt(observed.elapsedS, 1)} s (${observed.ticks} tick-uri la 60 Hz).`,
    `Distanță parcursă: ${Math.round(observed.distanceM)} m; viteză maximă ${fmt(observed.maximumSpeedMps)} m/s (${Math.round(observed.maximumSpeedMps * 3.6)} km/h).`,
    `Ferestre de viteză în trafic liber: ${observed.freeWindows}; episoade de accelerație: ${observed.accelerationEpisodes}.`,
    `Apropieri STOP: ${observed.stopApproaches}; opriri complete: ${observed.fullStops}; opriri de rulare: ${observed.rollingStops}; abandonate: ${observed.abandonedStopApproaches}.`,
    `Eșantioane 085-style înregistrate: ${observed.evidenceSamples}.`,
    `Mod: ${current.mode}; profil de bază: ${current.baseProfile.versionId}; publicare: ${current.earlyLoop.publication}.`,
  ])
    observedList.append(Object.assign(document.createElement('li'), { textContent: text }));

  changeBody.replaceChildren();
  for (const key of current.keys) {
    const row = document.createElement('tr');
    const cells = [
      `${key.label} ${key.changed ? '<span class="badge ok">schimbat</span>' : '<span class="badge bad">neschimbat</span>'}`,
      fmt(key.before, 3),
      key.candidate === null ? '—' : fmt(key.candidate, 3),
      fmt(key.after, 3),
      `${key.delta >= 0 ? '+' : ''}${fmt(key.delta, 3)}`,
      fmt(key.quality, 2),
    ];
    for (const [index, text] of cells.entries()) {
      const cell = document.createElement('td');
      cell.innerHTML = text;
      if (index > 0) cell.className = 'num';
      row.append(cell);
    }
    changeBody.append(row);
  }

  unchangedList.replaceChildren();
  const unchangedKeys = current.keys.filter((key) => !key.changed);
  for (const key of unchangedKeys)
    unchangedList.append(
      Object.assign(document.createElement('li'), {
        textContent: `${key.key}: ${key.before} → ${key.after} — ${key.unchangedReason ?? 'fără motiv raportat'}.`,
      }),
    );
  unchangedList.append(
    Object.assign(document.createElement('li'), {
      textContent: `${current.unchangedSurfaceKeys} chei din cele 80 sunt în afara suprafeței timpurii (doar 3 sunt în bucla 204): rămân exact la valorile de bază prin construcție.`,
    }),
  );
  unchangedCallout.textContent =
    'Blend-ul este limitat la 25% × calitate. O cheie fără dovezi READY, fără candidat numeric sau fără proveniență rămâne exact la valoarea de bază; panoul nu inventează un efect.';

  if (current.manual) {
    manualProof.hidden = false;
    manualProof.textContent = `${current.manual.statement} Episoade de dovezi: ${current.manual.evidenceEpisodes}; delta maxim: ${current.manual.maximumParameterDelta}; profil neschimbat: ${current.manual.profileUnchanged ? 'da' : 'nu'}; tokenuri LEARNING null: ${current.manual.learningTokensNull ? 'da' : 'nu'}.`;
  } else {
    manualProof.hidden = true;
  }
  setText(
    driveStatus,
    `Rezultat calculat din ${currentDrive.samples.length} eșantioane reale; nu există valori precompletate.`,
  );
}

function currentAnswers(): PlaytestAnswers {
  return {
    noticedChange: noticedSelect.value as PlaytestAnswers['noticedChange'],
    distinguishesModes: distinguishSelect.value as PlaytestAnswers['distinguishesModes'],
    supportingObservation: supportSelect.value as PlaytestAnswers['supportingObservation'],
    freeText: freeText.value,
  };
}

function refreshExportButton(): void {
  exportButton.disabled = !(
    noticedSelect.value &&
    distinguishSelect.value &&
    supportSelect.value &&
    phase === 'finished'
  );
}

function buildCurrentExport() {
  if (result === null || drive === null) throw new Error('Sesiunea nu s-a încheiat');
  const developerSelfTest = selectedSlot === 'dev';
  return buildPlaytestExport({
    participantSlot: developerSelfTest ? null : Number(selectedSlot),
    developerSelfTest,
    startedAt,
    finishedAt,
    finishedBy,
    result,
    drive,
    answers: currentAnswers(),
    autoDemo,
  });
}

function downloadExport(): void {
  if (result === null || drive === null) return;
  let record: ReturnType<typeof buildCurrentExport>;
  try {
    record = buildCurrentExport();
  } catch (error) {
    exportStatus.textContent =
      error instanceof Error ? error.message : 'Exportul nu poate fi construit.';
    return;
  }
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = record.developerSelfTest
    ? 'developer-self-test.json'
    : `participant-${record.participantSlot}.json`;
  link.click();
  URL.revokeObjectURL(url);
  exportStatus.textContent = record.developerSelfTest
    ? 'Export pregătit: developer-self-test.json (developer self-test, not a participant).'
    : `Export pregătit: participant-${record.participantSlot}.json.`;
}

async function createScene(): Promise<void> {
  backend = await createRenderingBackend(canvas, 'AUTO');
  const scene = backend.scene;
  scene.clearColor = new Color4(0.04, 0.07, 0.1, 1);
  const light = new HemisphericLight('playtest-light', new Vector3(0.2, 1, 0.1), scene);
  light.intensity = 0.95;
  light.groundColor = new Color3(0.16, 0.18, 0.2);

  const asphalt = new StandardMaterial('playtest-asphalt', scene);
  asphalt.diffuseColor = new Color3(0.16, 0.17, 0.19);
  const pavement = new StandardMaterial('playtest-pavement', scene);
  pavement.diffuseColor = new Color3(0.3, 0.3, 0.32);
  const paint = new StandardMaterial('playtest-paint', scene);
  paint.diffuseColor = new Color3(0.92, 0.92, 0.88);
  const taxiMaterial = new StandardMaterial('playtest-taxi', scene);
  taxiMaterial.diffuseColor = new Color3(0.95, 0.76, 0.18);
  const otherTaxiMaterial = new StandardMaterial('playtest-other-taxi', scene);
  otherTaxiMaterial.diffuseColor = new Color3(0.25, 0.45, 0.75);
  const civilianMaterial = new StandardMaterial('playtest-civilian', scene);
  civilianMaterial.diffuseColor = new Color3(0.7, 0.35, 0.5);

  const road = MeshBuilder.CreateBox(
    'playtest-road',
    { width: 8, height: 0.12, depth: ROAD_LENGTH_M },
    scene,
  );
  road.position = new Vector3(0, -0.06, ROAD_LENGTH_M / 2);
  road.material = asphalt;
  for (const sign of [-1, 1]) {
    const sidewalk = MeshBuilder.CreateBox(
      `playtest-sidewalk-${sign}`,
      { width: 1.8, height: 0.2, depth: ROAD_LENGTH_M },
      scene,
    );
    sidewalk.position = new Vector3(sign * 4.9, 0.02, ROAD_LENGTH_M / 2);
    sidewalk.material = pavement;
  }
  for (const line of stopLines) {
    const stripe = MeshBuilder.CreateBox(
      `playtest-${line.id}`,
      { width: 8, height: 0.02, depth: 0.55 },
      scene,
    );
    stripe.position = new Vector3(0, 0.02, line.z);
    stripe.material = paint;
  }
  const center = MeshBuilder.CreateBox(
    'playtest-center-line',
    { width: 0.12, height: 0.02, depth: ROAD_LENGTH_M },
    scene,
  );
  center.position = new Vector3(0, 0.02, ROAD_LENGTH_M / 2);
  center.material = paint;

  function carMesh(name: string, material: StandardMaterial, x: number, carZ: number) {
    const body = MeshBuilder.CreateBox(name, { width: 1.8, height: 0.62, depth: 4.2 }, scene);
    body.position = new Vector3(x, 0.36, carZ);
    body.material = material;
    return body;
  }
  egoMesh = carMesh('playtest-ego', taxiMaterial, 0, 0);
  carMesh('playtest-taxi-02', otherTaxiMaterial, 3.2, 42);
  carMesh('playtest-taxi-03', otherTaxiMaterial, -3.2, 88);
  const civilianA = MeshBuilder.CreateBox(
    'playtest-civilian-01',
    { width: 0.55, height: 1.1, depth: 0.55 },
    scene,
  );
  civilianA.position = new Vector3(5.2, 0.6, 260);
  civilianA.material = civilianMaterial;
  const civilianB = MeshBuilder.CreateBox(
    'playtest-civilian-02',
    { width: 0.55, height: 1.1, depth: 0.55 },
    scene,
  );
  civilianB.position = new Vector3(-5.2, 0.6, 700);
  civilianB.material = civilianMaterial;

  camera = new FreeCamera('playtest-camera', new Vector3(0, 5.8, -10), scene);
  camera.fov = 0.9;
  camera.minZ = 0.1;
  camera.maxZ = 700;
  scene.activeCamera = camera;
  scene.registerBeforeRender(() => {
    if (!camera) return;
    const civA = scene.getMeshByName('playtest-civilian-01');
    const civB = scene.getMeshByName('playtest-civilian-02');
    if (civA) civA.position.z = 260 + Math.sin(tick / 120) * 1.6;
    if (civB) civB.position.z = 700 + Math.sin(tick / 150) * 1.6;
    camera.position.x = lateral * 0.5;
    camera.position.y = 5.8;
    camera.position.z = z - 10;
    camera.setTarget(new Vector3(lateral, 1, z + 8));
    if (egoMesh) {
      egoMesh.position.x = lateral;
      egoMesh.position.z = z;
      egoMesh.rotation.y = -steering * 0.18;
    }
  });
  keyboardBinding = bindKeyboardDriveInput({
    surface: canvas,
    bindings: settings.input.bindings,
    port: keyboard,
    enabled: () => phase === 'driving',
  });
  phase = 'idle';
  startButton.disabled = false;
  startStatus.textContent = 'Scena este pregătită. Alegeți slotul și modul.';
  driveStatus.textContent = 'Scena este pregătită.';
}

function frameLoop(now: number): void {
  if (backend === null) {
    requestAnimationFrame(frameLoop);
    return;
  }
  if (lastFrame === null) lastFrame = now;
  const delta = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (phase === 'driving' || (phase === 'finished' && autoActive)) {
    accumulator += delta;
    let steps = 0;
    while (accumulator >= DRIVE_TICK_SECONDS && steps < 4) {
      step();
      accumulator -= DRIVE_TICK_SECONDS;
      steps += 1;
      if (phase !== 'driving' && !(phase === 'finished' && autoActive)) break;
    }
    if (steps === 4) accumulator = 0;
  }
  backend.render();
  requestAnimationFrame(frameLoop);
}

let lastFrame: number | null = null;
let accumulator = 0;

startButton.addEventListener('click', startSession);
finishButton.addEventListener('click', () => finishSession('finish'));
exportButton.addEventListener('click', downloadExport);
for (const element of [noticedSelect, distinguishSelect, supportSelect])
  element.addEventListener('change', refreshExportButton);
canvas.addEventListener('pointerdown', () => canvas.focus());
window.addEventListener('resize', () => backend?.resize());
window.addEventListener('pagehide', () => keyboardBinding?.dispose());

interface PlaytestDevHook {
  readonly snapshot: () => unknown;
  readonly finish: () => void;
  readonly key: (action: 'throttle' | 'brake', pressed: boolean) => void;
  readonly selfTest: () => void;
  readonly exportRecord: () => unknown;
  readonly download: () => void;
}

if (developerQuery) {
  const hook: PlaytestDevHook = {
    snapshot: () => ({
      phase,
      mode,
      selectedSlot,
      tick,
      elapsedS: tick / PLAYTEST_TICK_HZ,
      speedMps,
      z,
      lineIndex,
      lateral,
      autoActive,
      autoDecision,
      progress: recorder?.progress() ?? null,
      result:
        result === null
          ? null
          : {
              mode: result.mode,
              keys: result.keys,
              observed: result.observed,
              manual: result.manual,
              tokensVersionId: result.tokens.profile.versionId,
            },
      selfTestFallbacks: selfTest.fallbacks,
    }),
    finish: () => finishSession('developer'),
    key: (action, pressed) => dispatchDriveKey(action, pressed),
    selfTest: () => {
      selfTest.active = true;
      selfTest.dwelling = false;
      selfTest.committed = false;
      selfTest.dwellTicks = 0;
    },
    exportRecord: () => buildCurrentExport(),
    download: downloadExport,
  };
  window.__playtest = hook;
}

declare global {
  interface Window {
    __playtest?: PlaytestDevHook;
  }
}

void createScene().catch((error: unknown) => {
  phase = 'idle';
  startButton.disabled = true;
  startStatus.textContent = `Scena nu a putut porni: ${error instanceof Error ? error.message : String(error)}`;
  driveStatus.textContent = 'Scena nu a putut porni.';
});
requestAnimationFrame(frameLoop);
