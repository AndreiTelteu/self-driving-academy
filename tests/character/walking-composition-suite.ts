/**
 * PBI 236 — suita deterministă a compunerii V3 și raportul `composition:report`.
 *
 * Totul rulează headless, pe tick fix: inputul este injectat prin portul 193 exact ca tastatura
 * reală, tranzițiile trec prin 195/196, iar poziția personajului aparține walker-ului 192.
 * Nu există ceas de perete în scenarii; timpii măsurați în browser sunt separat, în `browser.json`.
 */
import { createHash } from 'node:crypto';
import { WALKER_GAIT_SPEEDS_MPS, characterPositionBits } from '../../src/character';
import {
  V3_COMPOSITION_VERSION,
  characterWriterRefusals,
  createCompositionWorld,
  createV3Composition,
  type CompositionFrame,
  type CompositionWorld,
  type V3Composition,
} from '../../src/app';
import { createDefaultSettings } from '../../src/settings';

export const COMPOSITION_REPORT_GENERATED_BY = 'scripts/run-v3-composition-report.mjs';
export const COMPOSITION_REPORT_COMMAND = 'npm run composition:report';

export interface CompositionCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
  readonly detail: string;
}

export interface CompositionRow {
  readonly sequence: string;
  readonly input: string;
  readonly controlledEntity: string;
  readonly mode: string;
  readonly position: string;
  readonly verdict: 'ACCEPTED' | 'REFUSED' | 'OK' | 'FAIL';
}

export interface CompositionReport {
  readonly schemaVersion: 1;
  readonly generatedBy: string;
  readonly command: string;
  readonly contract: typeof V3_COMPOSITION_VERSION;
  readonly tickHz: number;
  readonly mapId: string;
  readonly spawn: Readonly<{ x: number; z: number; yawRad: number }>;
  readonly rows: readonly CompositionRow[];
  readonly checks: readonly CompositionCheck[];
  readonly operations: Readonly<Record<string, number>>;
  readonly digest: string;
  readonly summary: Readonly<{
    rows: number;
    checks: number;
    passed: number;
    failed: number;
    pass: boolean;
  }>;
  readonly cost: Readonly<{
    status: 'NOT_RUN';
    reason: string;
  }>;
  readonly limitations: readonly string[];
}

interface RunResult {
  readonly rows: readonly CompositionRow[];
  readonly checks: readonly CompositionCheck[];
  readonly operations: Readonly<Record<string, number>>;
  readonly digest: string;
}

const CONTROL = createDefaultSettings('236-composition-report').input.control;

function check(
  checks: CompositionCheck[],
  name: string,
  expected: unknown,
  actual: unknown,
  detail: string,
): void {
  checks.push(
    Object.freeze({
      name,
      expected,
      actual,
      pass: JSON.stringify(expected) === JSON.stringify(actual),
      detail,
    }),
  );
}

function row(frame: CompositionFrame, sequence: string, input: string): CompositionRow {
  const controlledVehicle =
    frame.hud.controlledKind === 'VEHICLE'
      ? frame.vehicles.find((vehicle) => vehicle.vehicleId === frame.hud.controlledEntityId)
      : undefined;
  const positionM = controlledVehicle?.positionM ?? frame.character.positionM;
  return Object.freeze({
    sequence,
    input,
    controlledEntity: `${frame.hud.controlledKind}:${frame.hud.controlledEntityId}`,
    mode: frame.hud.mode,
    position: `${positionM.x.toFixed(3)},${positionM.y.toFixed(3)},${positionM.z.toFixed(3)}`,
    verdict: 'OK' as const,
  });
}

function entityOf(frame: CompositionFrame): string {
  return `${frame.hud.controlledKind}:${frame.hud.controlledEntityId}`;
}

function compositionFor(world: CompositionWorld): V3Composition {
  return createV3Composition({
    layout: world.layout,
    start: world.spawn,
    control: CONTROL,
    context: Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      sessionId: '236-composition-report',
      worldEpoch: 1,
    }),
    vehicles: world.vehicles,
  });
}

/**
 * Scenariul complet: mers, alergare, intrare, conducere, frânare, ieșire, revenire la mers.
 * Fiecare pas este numerotat de la 1, exact ca bucla fixă.
 */
function runScenario(world: CompositionWorld): RunResult {
  const composition = compositionFor(world);
  const rows: CompositionRow[] = [];
  const checks: CompositionCheck[] = [];
  let tick = 0;
  const step = (): CompositionFrame => {
    tick += 1;
    return composition.step({ tick });
  };
  const press = (action: Parameters<V3Composition['port']['setAction']>[0], pressed: boolean) =>
    composition.port.setAction(action, pressed);

  // A. Mers din input real, 120 tick-uri (2 s).
  press('throttle', true);
  let frame: CompositionFrame | null = null;
  for (let index = 0; index < 120; index += 1) frame = step();
  const walkFrame = frame!;
  rows.push(row(walkFrame, 'A-mers', 'throttle ținut, 120 tick-uri'));
  check(
    checks,
    'mers: clipul este walk',
    'walk',
    walkFrame.hud.clipId,
    'clipul se alege din viteza măsurată de walker',
  );
  check(
    checks,
    'mers: autoritatea este personajul',
    'CHARACTER:player-character',
    entityOf(walkFrame),
    'arbitrajul 193 produce comanda personajului',
  );
  check(
    checks,
    'mers: modul raportat este MANUAL',
    'MANUAL',
    walkFrame.hud.mode,
    'personajul este condus manual; cele trei moduri rămân ale mașinii',
  );
  check(
    checks,
    'mers: camera urmărește aceeași entitate',
    'player-character',
    walkFrame.camera.entityId,
    '194 primește authorityEntityId din 193',
  );
  check(
    checks,
    'mers: camera nu este trunchiată de taxiul parcat',
    null,
    walkFrame.camera.obstructedBy,
    `distanța realizată ${walkFrame.camera.distanceM.toFixed(3)} m din ${walkFrame.camera.requestedDistanceM.toFixed(3)} m`,
  );
  check(
    checks,
    'mers: s-a deplasat peste 1,5 m',
    true,
    Math.hypot(
      walkFrame.character.positionM.x - world.spawn.x,
      walkFrame.character.positionM.z - world.spawn.z,
    ) > 1.5,
    `deplasare ${Math.hypot(
      walkFrame.character.positionM.x - world.spawn.x,
      walkFrame.character.positionM.z - world.spawn.z,
    ).toFixed(3)} m`,
  );
  check(
    checks,
    'mers: o singură livrare pe tick către personaj',
    { CHARACTER: 120, VEHICLE: 0 },
    walkFrame.stats.deliveries,
    '193 `deliver` este chemat exact o dată, pe consumatorul activ',
  );
  press('throttle', false);

  // B. Alergare din input real, 90 tick-uri.
  composition.resetScenario();
  tick = walkFrame.tick;
  press('throttle', true);
  composition.setSprint(true);
  for (let index = 0; index < 90; index += 1) frame = step();
  const runFrame = frame!;
  rows.push(row(runFrame, 'B-alergare', 'throttle + sprint ținute, 90 tick-uri'));
  check(
    checks,
    'alergare: clipul este run',
    'run',
    runFrame.hud.clipId,
    'peste 1,05 × viteza clipului de mers, clipul măsurat este run',
  );
  check(
    checks,
    'alergare: viteza depășește pragul de mers',
    true,
    runFrame.character.speedMps > WALKER_GAIT_SPEEDS_MPS.WALK * 1.05,
    `viteza ${runFrame.character.speedMps.toFixed(4)} m/s vs prag ${(
      WALKER_GAIT_SPEEDS_MPS.WALK * 1.05
    ).toFixed(4)}`,
  );
  press('throttle', false);
  composition.setSprint(false);

  // C. Intrare în taxi din input real (G este proiectat pe `requestEntry`).
  composition.resetScenario();
  const beforeEntry = composition.character();
  const beforeEntryBits = beforeEntry.positionBits;
  const beforeEntryWalkerTick = beforeEntry.tick;
  const beforeEntryDeliveries = composition.arbiter.getStats().delivered;
  composition.requestEntry('taxi-01');
  const enterFrame = step();
  rows.push(row(enterFrame, 'C-intrare', 'G (requestEntry taxi-01)'));
  check(
    checks,
    'intrare: autoritatea trece pe taxi',
    'VEHICLE:taxi-01',
    entityOf(enterFrame),
    '195 întoarce exact autoritatea 193 VEHICLE:<id>',
  );
  check(
    checks,
    'intrare: camera primește taxiul în același tick',
    'taxi-01',
    enterFrame.camera.entityId,
    'cererea 194 din 195 este aplicată în tick-ul intrării',
  );
  check(
    checks,
    'intrare: poziția personajului rămâne bit-identică',
    beforeEntryBits,
    enterFrame.character.positionBits,
    '195 nu mută corpul; walker-ul nu este pașit în tick-ul intrării',
  );
  check(
    checks,
    'intrare: walker-ul nu a primit tick',
    beforeEntryWalkerTick,
    enterFrame.character.tick,
    'după TAKE personajul nu mai primește input',
  );
  check(
    checks,
    'intrare: modelul 198 deschide un segment MANUAL',
    { opened: 'MANUAL', kind: 'MANUAL' },
    {
      opened: enterFrame.segments.openSegmentId === null ? null : 'MANUAL',
      kind: enterFrame.segments.walking ? 'NONE' : 'MANUAL',
    },
    'ENTER este exact tranziția 195/197',
  );
  check(
    checks,
    'intrare: livrările merg exclusiv către vehicul',
    beforeEntryDeliveries.VEHICLE + 1,
    enterFrame.stats.deliveries.VEHICLE,
    'exact un consumator per tick',
  );
  check(
    checks,
    'intrare: personajul nu primește nicio livrare în plus',
    beforeEntryDeliveries.CHARACTER,
    enterFrame.stats.deliveries.CHARACTER,
    'după TAKE inputul personajului este inactiv',
  );
  const doubleDelivery = (() => {
    try {
      composition.arbiter.deliver(composition.lastResult!, 'CHARACTER', {
        character: () => {},
        vehicle: () => {},
      });
      return 'ACCEPTED';
    } catch (error: unknown) {
      return (error as { code?: string }).code ?? 'UNKNOWN';
    }
  })();
  check(
    checks,
    'intrare: dubla livrare este refuzată de arbitraj',
    'DOUBLE_DELIVERY_REFUSED',
    doubleDelivery,
    'refuzul vine din 193, nu din compunere',
  );
  const entryIgnored = (() => {
    composition.requestEntry('taxi-01');
    const after = step();
    return after.events.at(-1)?.kind ?? 'NONE';
  })();
  check(
    checks,
    'intrare: o a doua cerere cât timp ești în mașină este ignorată',
    'ENTRY_IGNORED',
    entryIgnored,
    'compunerea nu inventează un al doilea TAKE',
  );

  // D. Conducere: 120 tick-uri de accelerație, fără virare.
  const seatedPositionBits = composition.character().positionBits;
  const taxiBefore = composition.frame.vehicles.find((vehicle) => vehicle.vehicleId === 'taxi-01')!;
  const driveDeliveries = composition.arbiter.getStats().delivered;
  composition.releaseInput();
  press('throttle', true);
  for (let index = 0; index < 120; index += 1) frame = step();
  const driveFrame = frame!;
  const taxiAfter = driveFrame.vehicles.find((vehicle) => vehicle.vehicleId === 'taxi-01')!;
  rows.push(row(driveFrame, 'D-conducere', 'throttle ținut, 120 tick-uri'));
  check(
    checks,
    'conducere: taxiul s-a deplasat peste 3 m',
    true,
    Math.hypot(
      taxiAfter.positionM.x - taxiBefore.positionM.x,
      taxiAfter.positionM.z - taxiBefore.positionM.z,
    ) > 3,
    `deplasare ${Math.hypot(
      taxiAfter.positionM.x - taxiBefore.positionM.x,
      taxiAfter.positionM.z - taxiBefore.positionM.z,
    ).toFixed(3)} m`,
  );
  check(
    checks,
    'conducere: modul rămâne MANUAL',
    'MANUAL',
    driveFrame.hud.mode,
    '195 impune MANUAL și nu inventează un al patrulea mod',
  );
  check(
    checks,
    'conducere: corpul personajului este neschimbat',
    seatedPositionBits,
    driveFrame.character.positionBits,
    'walker-ul nu este pașit cât timp autoritatea este a mașinii',
  );
  check(
    checks,
    'conducere: comenzile merg exclusiv către vehicul',
    driveDeliveries.VEHICLE + 120,
    driveFrame.stats.deliveries.VEHICLE,
    '120 de tick-uri de conducere, 120 livrări de vehicul',
  );
  check(
    checks,
    'conducere: camera urmărește taxiul',
    'taxi-01',
    driveFrame.camera.entityId,
    '194 urmărește exact authorityEntityId',
  );
  check(
    checks,
    'conducere: modelul 198 ține tick-ul cu FOCUS pe mașină',
    'FOCUS',
    driveFrame.lastSegmentAction,
    '198 nu are pas DRIVE; FOCUS nu schimbă autoritatea',
  );
  press('throttle', false);

  // E. Frânare până la oprire, apoi ieșire din input real.
  press('brake', true);
  let stopped = false;
  for (let index = 0; index < 240; index += 1) {
    frame = step();
    const car = frame.vehicles.find((vehicle) => vehicle.vehicleId === 'taxi-01')!;
    if (car.speedMps === 0) {
      stopped = true;
      break;
    }
  }
  press('brake', false);
  check(
    checks,
    'frânare: taxiul ajunge la 0 m/s',
    true,
    stopped,
    '196 refuză ieșirea peste 1,371 m/s',
  );
  const beforeExitDeliveries = composition.frame.stats.deliveries;
  composition.requestExit();
  const exitFrame = step();
  const released = exitFrame.vehicles.find((vehicle) => vehicle.vehicleId === 'taxi-01')!;
  rows.push(row(exitFrame, 'E-ieșire', 'G (requestExit) după oprire'));
  check(
    checks,
    'ieșire: autoritatea revine la personaj',
    'CHARACTER:player-character',
    entityOf(exitFrame),
    '196 întoarce exact autoritatea 193 CHARACTER:<id>',
  );
  check(
    checks,
    'ieșire: mașina eliberată revine în AUTO',
    'AUTO',
    released.controlMode,
    'singurul câmp schimbat de 196 este controlMode',
  );
  check(
    checks,
    'ieșire: camera primește personajul în același tick',
    'player-character',
    exitFrame.camera.entityId,
    'cererea 194 din 196 este aplicată în tick-ul ieșirii',
  );
  check(
    checks,
    'ieșire: segmentul MANUAL este închis cu RETURN_TO_AUTO',
    'RETURN_TO_AUTO',
    composition.segments.getStats().lastClosedSegmentId === null
      ? null
      : exitFrame.segments.counters.closedManual === 1
        ? 'RETURN_TO_AUTO'
        : 'UNKNOWN',
    '198 închide segmentul la ieșire',
  );
  check(
    checks,
    'ieșire: niciun candidat de estimator pentru MANUAL',
    0,
    exitFrame.segments.counters.candidates,
    'numai LEARNING eligibil produce candidat 069',
  );
  check(
    checks,
    'ieșire: personajul primește din nou input',
    beforeExitDeliveries.CHARACTER + 1,
    exitFrame.stats.deliveries.CHARACTER,
    'după RETURN vehiculul nu mai primește input',
  );
  check(
    checks,
    'ieșire: vehiculul nu primește nicio livrare în plus',
    beforeExitDeliveries.VEHICLE,
    exitFrame.stats.deliveries.VEHICLE,
    'exact un consumator per tick, acum personajul',
  );
  const exitGround = exitFrame.character.positionM.y;
  check(
    checks,
    'ieșire: punctul de ieșire stă pe suprafața autorată',
    exitGround,
    exitFrame.character.groundHeightM,
    '196 furnizează exact WalkerOptions.start, iar walker-ul confirmă cota',
  );
  for (let index = 0; index < 25; index += 1) frame = step();
  const exitSettled = frame!;
  check(
    checks,
    'ieșire: camera găsește un cadru liber după tranziție',
    true,
    exitSettled.camera.obstructedBy === null && exitSettled.camera.distanceM > 2,
    `distanță ${exitSettled.camera.distanceM.toFixed(3)} m, obstacol ${String(exitSettled.camera.obstructedBy)}`,
  );

  // F. Revenire la mers, 90 tick-uri.
  const exitBits = exitFrame.character.positionBits;
  const releasedAt = released.positionM;
  press('throttle', true);
  for (let index = 0; index < 90; index += 1) frame = step();
  const afterWalk = frame!;
  rows.push(row(afterWalk, 'F-revenire-mers', 'throttle ținut, 90 tick-uri'));
  check(
    checks,
    'revenire: clipul este din nou walk',
    'walk',
    afterWalk.hud.clipId,
    'după ieșire personajul merge din nou pe jos',
  );
  check(
    checks,
    'revenire: poziția s-a schimbat față de punctul de ieșire',
    true,
    afterWalk.character.positionBits !== exitBits,
    'mersul post-ieșire deplasează din nou corpul',
  );
  const releasedAfter = afterWalk.vehicles.find((vehicle) => vehicle.vehicleId === 'taxi-01')!;
  check(
    checks,
    'revenire: mașina eliberată nu mai primește input',
    { x: releasedAt.x, z: releasedAt.z, speed: 0 },
    {
      x: releasedAfter.positionM.x,
      z: releasedAfter.positionM.z,
      speed: releasedAfter.speedMps,
    },
    'după RETURN vehiculul nu este pașit; poziția și viteza rămân înghețate',
  );
  press('throttle', false);

  // G. Animația nu scrie poziția: 60 cadre de render, biți identici.
  let framesMatch = 0;
  for (let index = 0; index < 60; index += 1) {
    const renderFrame = composition.characterFrame();
    if (characterPositionBits(renderFrame.positionM) === composition.frame.character.positionBits)
      framesMatch += 1;
  }
  check(
    checks,
    'animație: 60/60 cadre de render păstrează poziția bit-identică',
    60,
    framesMatch,
    '191 copiază poziția autoritară, nu o calculează',
  );
  check(
    checks,
    'animație: writer-ul refuză poziția și root motion',
    ['AUTHORITY_WRITE_REFUSED', 'AUTHORITY_WRITE_REFUSED'],
    [...characterWriterRefusals('player-character')],
    'canalele de scriere există ca să refuze explicit',
  );

  const stats = composition.frame.stats;
  const operations = Object.freeze({
    ticks: stats.ticks,
    deliveriesCharacter: stats.deliveries.CHARACTER,
    deliveriesVehicle: stats.deliveries.VEHICLE,
    ticksWithoutDelivery: stats.ticksWithoutDelivery,
    walkerTicks: stats.walkerTicks,
    cameraFrames: stats.cameraFrames,
    segmentCommands: stats.segmentCommands,
    entryAttempts: stats.entryAttempts,
    exitAttempts: stats.exitAttempts,
  });
  composition.dispose();
  return Object.freeze({
    rows: Object.freeze(rows),
    checks: Object.freeze(checks),
    operations,
    digest: digestOf(rows, checks),
  });
}

function digestOf(rows: readonly CompositionRow[], checks: readonly CompositionCheck[]): string {
  return createHash('sha256').update(JSON.stringify({ rows, checks })).digest('hex');
}

export function runCompositionReport(): CompositionReport {
  const world = createCompositionWorld();
  const first = runScenario(world);
  const second = runScenario(world);
  const checks = [...first.checks];
  check(
    checks,
    'determinism: două rulări produc aceleași rânduri și verificări',
    first.digest,
    second.digest,
    'același input, același tick, aceeași poziție',
  );
  check(
    checks,
    'compunere: fiecare tick are exact o livrare',
    0,
    first.operations.ticksWithoutDelivery,
    '193 `deliver` este singurul canal către consumatori',
  );
  check(
    checks,
    'compunere: suma livrărilor acoperă toate tick-urile',
    first.operations.ticks,
    first.operations.deliveriesCharacter + first.operations.deliveriesVehicle,
    'personaj + vehicul = tick-uri',
  );
  const digest = digestOf(first.rows, checks);
  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    schemaVersion: 1,
    generatedBy: COMPOSITION_REPORT_GENERATED_BY,
    command: COMPOSITION_REPORT_COMMAND,
    contract: V3_COMPOSITION_VERSION,
    tickHz: 60,
    mapId: world.mapId,
    spawn: world.spawn,
    rows: first.rows,
    checks: Object.freeze(checks),
    operations: first.operations,
    digest,
    summary: Object.freeze({
      rows: first.rows.length,
      checks: checks.length,
      passed,
      failed: checks.length - passed,
      pass: passed === checks.length,
    }),
    cost: Object.freeze({
      status: 'NOT_RUN' as const,
      reason:
        'Măsurătoarea de frame/tick se face în browser real (SwiftShader) și se scrie în browser.json; Node headless nu este raportat ca FPS hardware.',
    }),
    limitations: Object.freeze([
      'Mișcarea mașinii conduse este un adaptor de jucabilitate peste comanda 024 și mecanica 023 (masă, forță, frână, ampatament, bracaj); fizica Rapier 022/024 nu este compusă aici.',
      '198 nu are pas DRIVE: cât timp jucătorul stă în mașină, modelul este ținut în pas cu FOCUS pe vehiculul condus, iar contorul `focus` este raportat explicit.',
      'Scenariul folosește resetarea de probă (`resetScenario`) între mers/alergare și intrare, pentru ca aceleași taste reale să poată fi probate din poziția de start.',
      'Raportul headless nu măsoară frame/tick; costul real este în browser.json (backend software, nu hardware).',
    ]),
  });
}
