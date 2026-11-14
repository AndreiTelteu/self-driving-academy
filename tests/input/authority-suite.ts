/**
 * PBI 193 — suita deterministă de dovezi pentru autoritatea unică de input.
 *
 * Ea rulează arbitrajul real peste toate combinațiile de taste, peste ambele autorități, peste
 * tranzițiile personaj ↔ vehicul și peste legarea reală la tastatură din 066, apoi măsoară:
 * câți consumatori primesc comandă la un tick, ce se întâmplă cu tastele ținute la tranziție,
 * ce se întâmplă când focusul este într-un câmp de text și ce stare se poate salva.
 */
import { createHash } from 'node:crypto';
import {
  bindKeyboardDriveInput,
  createInputAuthorityArbiter,
  authorityActions,
  authorityDriveActions,
  isEmptyAuthorityCommand,
  INPUT_AUTHORITY_CONTRACT_VERSION,
  INPUT_AUTHORITY_TICK_HZ,
  type AuthorityAction,
  type AuthorityConsumer,
  type AuthorityTickResult,
  type InputAuthority,
  type InputAuthoritySnapshot,
} from '../../src/input';
import {
  createRectanglePolygon,
  createWalker,
  createWalkWorld,
  type Walker,
  type WalkerInput,
} from '../../src/character';
import { createDefaultSettings } from '../../src/settings';
import { createFocusFixture } from './focus-fixture';

export const AUTHORITY_REPORT_CONTRACT = INPUT_AUTHORITY_CONTRACT_VERSION;
export const AUTHORITY_REPORT_COMMAND = 'npm run authority:report';

const CONTEXT = Object.freeze({
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: 'evidence-193-authority',
  worldEpoch: 7,
});
const CHARACTER: InputAuthority = Object.freeze({
  consumer: 'CHARACTER' as const,
  characterId: 'player-character',
});
const VEHICLE: InputAuthority = Object.freeze({
  consumer: 'VEHICLE' as const,
  vehicleId: 'taxi-193',
});
const CHARACTER_YAW_RAD = 0.4;

export interface ScenarioRow {
  readonly id: string;
  readonly label: string;
  readonly source: 'arbiter' | '066-focus';
  readonly authority: string;
  readonly held: readonly AuthorityAction[];
  readonly consumer: string;
  readonly command: string;
  readonly empty: boolean;
  readonly expectation: string;
  readonly verdict: 'PASS' | 'FAIL';
}

export interface TransitionRow {
  readonly direction: 'CHARACTER→VEHICLE' | 'VEHICLE→CHARACTER';
  readonly held: readonly AuthorityAction[];
  readonly transitioned: boolean;
  readonly beforeCommand: string;
  readonly beforeEmpty: boolean;
  readonly afterCommand: string;
  readonly afterEmpty: boolean;
  readonly afterConsumer: string;
  readonly rearmedCommand: string;
  readonly rearmedEmpty: boolean;
  /** Comanda de referință, produsă de aceleași taste fără nicio tranziție. */
  readonly controlCommand: string;
  readonly verdict: 'PASS' | 'FAIL';
}

export interface AuthorityReport {
  readonly generatedBy: string;
  readonly command: string;
  readonly contract: string;
  readonly tickHz: number;
  readonly reference: Readonly<{
    context: typeof CONTEXT;
    character: string;
    vehicle: string;
    actions: readonly AuthorityAction[];
    driveActions: readonly string[];
    transitionRule: 'NEUTRALIZE_UNTIL_RELEASE';
    consumerOfEmptyCommand: 'ACTIVE_AUTHORITY_ONLY';
  }>;
  readonly scenarios: readonly ScenarioRow[];
  readonly exhaustive: Readonly<{
    combinationsPerAuthority: number;
    authorities: number;
    ticks: number;
    addressed: number;
    deliveredCharacter: number;
    deliveredVehicle: number;
    characterNonEmptyTicks: number;
    vehicleNonEmptyTicks: number;
    emptyTicks: number;
    simultaneousNonEmptyTicks: number;
    wrongConsumerDeliveries: number;
  }>;
  readonly delivery: Readonly<{
    characterDeliveries: number;
    vehicleDeliveries: number;
    doubleDeliveryRefused: boolean;
    inactiveConsumerRefused: boolean;
    staleResultRefused: boolean;
    codes: readonly string[];
    refused: Readonly<{ doubleDelivery: number; inactiveConsumer: number; staleResult: number }>;
  }>;
  readonly transitions: readonly TransitionRow[];
  readonly focus: Readonly<{
    throttleBinding: string;
    fieldConsumer: string;
    fieldHeldKeys: number;
    fieldCommandEmpty: boolean;
    fieldWalkerDistanceM: number;
    fieldDefaultPrevented: boolean;
    resumedHeldKeys: number;
    resumedCommandEmpty: boolean;
    resumedWalkerDistanceM: number;
    resumedDefaultPrevented: boolean;
    listenersAfterDispose: number;
  }>;
  readonly state: Readonly<{
    bytes: number;
    keys: readonly string[];
    authorityPreserved: boolean;
    tickPreserved: boolean;
    heldPreserved: boolean;
    neutralizedOnRestore: boolean;
    firstTickAfterRestoreEmpty: boolean;
    firstTickAfterRestoreConsumer: string;
    plainJson: boolean;
    restoreRefusals: number;
  }>;
  readonly determinism: Readonly<{ runs: number; identical: boolean; digest: string }>;
  readonly summary: Readonly<{
    scenarios: number;
    scenariosPassed: number;
    transitionRows: number;
    transitionsPassed: number;
    criterion1: boolean;
    criterion2: boolean;
    focus: boolean;
    serializable: boolean;
    pass: boolean;
  }>;
  readonly limitations: readonly string[];
}

function countingPorts() {
  const counts: Record<AuthorityConsumer, number> = { CHARACTER: 0, VEHICLE: 0 };
  return {
    counts,
    ports: {
      character: () => {
        counts.CHARACTER += 1;
      },
      vehicle: () => {
        counts.VEHICLE += 1;
      },
    },
    get total() {
      return counts.CHARACTER + counts.VEHICLE;
    },
  };
}

function characterInput(result: AuthorityTickResult): WalkerInput {
  if (result.command.consumer !== 'CHARACTER') throw new Error('expected a CHARACTER command');
  return result.command.input;
}

/** Reprezentarea text a comenzii, folosită în tabelele din raport. */
export function summarizeAuthorityCommand(result: AuthorityTickResult): string {
  const command = result.command;
  if (command.consumer === 'CHARACTER') {
    const input = command.input;
    return `gait=${input.gait} intensity=${input.intensity.toFixed(3)} headingRad=${input.headingRad.toFixed(6)}`;
  }
  const data = command.command;
  return `throttle=${data.throttle.toFixed(3)} brake=${data.brake.toFixed(3)} steering=${data.steering.toFixed(3)} handbrake=${String(data.handbrake)} signal=${data.turnSignal}`;
}

function authorityLabel(authority: InputAuthority): string {
  return authority.consumer === 'CHARACTER'
    ? `CHARACTER:${authority.characterId}`
    : `VEHICLE:${authority.vehicleId}`;
}

interface ScenarioSpec {
  readonly id: string;
  readonly label: string;
  readonly authority: InputAuthority;
  readonly held: readonly AuthorityAction[];
  readonly characterYawRad: number;
  readonly expect: AuthorityConsumer;
  readonly expectEmpty: boolean;
  readonly expectation: string;
  readonly verify: (result: AuthorityTickResult) => boolean;
}

const near = (a: number, b: number, tolerance = 1e-12): boolean => Math.abs(a - b) <= tolerance;

const scenarioSpecs: readonly ScenarioSpec[] = Object.freeze([
  {
    id: 'character-idle',
    label: 'Personaj activ, nicio tastă',
    authority: CHARACTER,
    held: [],
    characterYawRad: CHARACTER_YAW_RAD,
    expect: 'CHARACTER',
    expectEmpty: true,
    expectation: 'gait NONE, intensitate 0',
    verify: (result) =>
      result.command.consumer === 'CHARACTER' &&
      result.command.input.gait === 'NONE' &&
      result.command.input.intensity === 0,
  },
  {
    id: 'character-walk',
    label: 'Personaj activ, accelerație ținută',
    authority: CHARACTER,
    held: ['throttle'],
    characterYawRad: CHARACTER_YAW_RAD,
    expect: 'CHARACTER',
    expectEmpty: false,
    expectation: 'gait WALK, intensitate 1, heading = yaw',
    verify: (result) =>
      result.command.consumer === 'CHARACTER' &&
      result.command.input.gait === 'WALK' &&
      result.command.input.intensity === 1 &&
      near(result.command.input.headingRad, CHARACTER_YAW_RAD),
  },
  {
    id: 'character-run',
    label: 'Personaj activ, accelerație + sprint',
    authority: CHARACTER,
    held: ['throttle', 'sprint'],
    characterYawRad: CHARACTER_YAW_RAD,
    expect: 'CHARACTER',
    expectEmpty: false,
    expectation: 'gait RUN, intensitate 1',
    verify: (result) =>
      result.command.consumer === 'CHARACTER' &&
      result.command.input.gait === 'RUN' &&
      result.command.input.intensity === 1,
  },
  {
    id: 'character-turn-right',
    label: 'Personaj activ, virare dreapta',
    authority: CHARACTER,
    held: ['throttle', 'steerRight'],
    characterYawRad: 0,
    expect: 'CHARACTER',
    expectEmpty: false,
    expectation: 'heading = yaw + π/2',
    verify: (result) =>
      result.command.consumer === 'CHARACTER' && near(result.command.input.headingRad, Math.PI / 2),
  },
  {
    id: 'character-turn-left',
    label: 'Personaj activ, virare stânga',
    authority: CHARACTER,
    held: ['throttle', 'steerLeft'],
    characterYawRad: 0,
    expect: 'CHARACTER',
    expectEmpty: false,
    expectation: 'heading = yaw − π/2',
    verify: (result) =>
      result.command.consumer === 'CHARACTER' &&
      near(result.command.input.headingRad, -Math.PI / 2),
  },
  {
    id: 'character-brake-stops',
    label: 'Personaj activ, frână fără accelerație',
    authority: CHARACTER,
    held: ['brake'],
    characterYawRad: CHARACTER_YAW_RAD,
    expect: 'CHARACTER',
    expectEmpty: true,
    expectation: 'comandă vidă (192 nu are mers înapoi)',
    verify: (result) =>
      result.command.consumer === 'CHARACTER' && result.command.input.gait === 'NONE',
  },
  {
    id: 'vehicle-idle',
    label: 'Vehicul activ, nicio tastă',
    authority: VEHICLE,
    held: [],
    characterYawRad: CHARACTER_YAW_RAD,
    expect: 'VEHICLE',
    expectEmpty: true,
    expectation: 'throttle 0, brake 0, steering 0, semnal OFF',
    verify: (result) =>
      result.command.consumer === 'VEHICLE' &&
      result.command.command.throttle === 0 &&
      result.command.command.brake === 0 &&
      result.command.command.steering === 0 &&
      result.command.command.turnSignal === 'OFF',
  },
  {
    id: 'vehicle-throttle-left',
    label: 'Vehicul activ, accelerație + virare stânga',
    authority: VEHICLE,
    held: ['throttle', 'steerLeft'],
    characterYawRad: CHARACTER_YAW_RAD,
    expect: 'VEHICLE',
    expectEmpty: false,
    expectation: 'throttle 1, steering −1, source PLAYER',
    verify: (result) =>
      result.command.consumer === 'VEHICLE' &&
      result.command.command.throttle === 1 &&
      result.command.command.brake === 0 &&
      result.command.command.steering === -1 &&
      result.command.command.source === 'PLAYER',
  },
  {
    id: 'vehicle-brake',
    label: 'Vehicul activ, frână',
    authority: VEHICLE,
    held: ['brake'],
    characterYawRad: CHARACTER_YAW_RAD,
    expect: 'VEHICLE',
    expectEmpty: false,
    expectation: 'brake 1, throttle 0',
    verify: (result) =>
      result.command.consumer === 'VEHICLE' &&
      result.command.command.brake === 1 &&
      result.command.command.throttle === 0,
  },
  {
    id: 'vehicle-handbrake',
    label: 'Vehicul activ, frână de mână',
    authority: VEHICLE,
    held: ['handbrake'],
    characterYawRad: CHARACTER_YAW_RAD,
    expect: 'VEHICLE',
    expectEmpty: false,
    expectation: 'handbrake true, axe pe zero',
    verify: (result) =>
      result.command.consumer === 'VEHICLE' &&
      result.command.command.handbrake === true &&
      result.command.command.throttle === 0 &&
      result.command.command.steering === 0,
  },
  {
    id: 'vehicle-hazard',
    label: 'Vehicul activ, ambele semnale',
    authority: VEHICLE,
    held: ['signalLeft', 'signalRight'],
    characterYawRad: CHARACTER_YAW_RAD,
    expect: 'VEHICLE',
    expectEmpty: false,
    expectation: 'turnSignal HAZARD',
    verify: (result) =>
      result.command.consumer === 'VEHICLE' && result.command.command.turnSignal === 'HAZARD',
  },
  {
    id: 'vehicle-opposite-axes-cancel',
    label: 'Vehicul activ, accelerație și frână simultan',
    authority: VEHICLE,
    held: ['throttle', 'brake'],
    characterYawRad: CHARACTER_YAW_RAD,
    expect: 'VEHICLE',
    expectEmpty: true,
    expectation: 'axele se anulează (aceeași regulă ca filtrul 066)',
    verify: (result) =>
      result.command.consumer === 'VEHICLE' &&
      result.command.command.throttle === 0 &&
      result.command.command.brake === 0,
  },
]);

function runScenario(spec: ScenarioSpec): ScenarioRow {
  const arbiter = createInputAuthorityArbiter({ context: CONTEXT, authority: spec.authority });
  const counter = countingPorts();
  for (const action of spec.held) arbiter.setAction(action, true);
  const result = arbiter.step({ tick: 1, characterYawRad: spec.characterYawRad });
  arbiter.deliver(result, result.command.consumer, counter.ports);
  const consumer = result.command.consumer;
  const empty = isEmptyAuthorityCommand(result.command);
  const deliveredOnce =
    counter.total === 1 &&
    counter.counts[consumer] === 1 &&
    counter.counts[consumer === 'CHARACTER' ? 'VEHICLE' : 'CHARACTER'] === 0;
  const verdict: 'PASS' | 'FAIL' =
    consumer === spec.expect && empty === spec.expectEmpty && deliveredOnce && spec.verify(result)
      ? 'PASS'
      : 'FAIL';
  return {
    id: spec.id,
    label: spec.label,
    source: 'arbiter',
    authority: authorityLabel(spec.authority),
    held: spec.held,
    consumer,
    command: summarizeAuthorityCommand(result),
    empty,
    expectation: spec.expectation,
    verdict,
  };
}

/** Proba de focus: legarea reală 066, nu o copie a predicatei. */
function focusScenarioRow(): { row: ScenarioRow; focus: AuthorityReport['focus'] } {
  const fixture = createFocusFixture();
  const settings = createDefaultSettings('193-evidence');
  const arbiter = createInputAuthorityArbiter({ context: CONTEXT, authority: CHARACTER });
  const binding = bindKeyboardDriveInput({
    surface: fixture.surface as unknown as HTMLElement,
    bindings: settings.input.bindings,
    port: arbiter.port,
  });
  const walker = flatWalker();
  const throttleCode = settings.input.bindings.throttle;

  // 1. Focusul stă într-un câmp de text: 066 golește intenția, iar tasta nu ajunge la arbitraj.
  fixture.setBlocked(true);
  binding.sync();
  const fieldEvent = fixture.key('keydown', throttleCode);
  const fieldTick = arbiter.step({ tick: 1, characterYawRad: walker.state.yawRad });
  const fieldHeldKeys = arbiter.getStats().held;
  const fieldDistance = runWalker(walker, 30, characterInput(fieldTick));

  // 2. Focusul iese din câmp: o apăsare nouă este intenție reală și mișcă personajul.
  fixture.setBlocked(false);
  binding.sync();
  const resumedEvent = fixture.key('keydown', throttleCode);
  const resumedTick = arbiter.step({ tick: 2, characterYawRad: walker.state.yawRad });
  const before = walker.stats.distanceM;
  const resumedDistance = runWalker(walker, 30, characterInput(resumedTick));
  const resumedHeldKeys = arbiter.getStats().held;
  binding.dispose();
  arbiter.dispose();

  const consumer = resumedTick.command.consumer;
  const fieldEmpty = isEmptyAuthorityCommand(fieldTick.command);
  const resumedEmpty = isEmptyAuthorityCommand(resumedTick.command);
  const verdict: 'PASS' | 'FAIL' =
    consumer === 'CHARACTER' &&
    fieldEmpty &&
    fieldHeldKeys === 0 &&
    fieldDistance === 0 &&
    fieldEvent.defaultPrevented === false &&
    !resumedEmpty &&
    resumedEvent.defaultPrevented === true &&
    resumedDistance > 0
      ? 'PASS'
      : 'FAIL';
  return {
    row: {
      id: 'focus-text-field',
      label: 'Tastă peste un câmp de text (legare 066 reală)',
      source: '066-focus',
      authority: authorityLabel(CHARACTER),
      held: [],
      consumer,
      command: summarizeAuthorityCommand(fieldTick),
      empty: fieldEmpty,
      expectation:
        'câmpul de text blochează intenția (comandă vidă, 0 m); după ieșire, comanda redevine activă',
      verdict,
    },
    focus: {
      throttleBinding: throttleCode,
      fieldConsumer: fieldTick.command.consumer,
      fieldHeldKeys,
      fieldCommandEmpty: fieldEmpty,
      fieldWalkerDistanceM: fieldDistance,
      fieldDefaultPrevented: fieldEvent.defaultPrevented,
      resumedHeldKeys,
      resumedCommandEmpty: resumedEmpty,
      resumedWalkerDistanceM:
        resumedDistance - before > 0 ? Number((resumedDistance - before).toFixed(4)) : 0,
      resumedDefaultPrevented: resumedEvent.defaultPrevented,
      listenersAfterDispose: fixture.listeners(),
    },
  };
}

function flatWalker(): Walker {
  const world = createWalkWorld({
    surfaces: [
      {
        id: 'probe-ground',
        kind: 'STREET',
        topM: 0,
        vertices: createRectanglePolygon('probe-ground', { x: 0, z: 0 }, { x: 80, z: 80 }).vertices,
      },
    ],
  });
  return createWalker({
    world,
    start: { positionM: { x: 0, y: 0, z: 0 }, yawRad: 0 },
    entityId: 'evidence-walker',
  });
}

/** Rulează walker-ul real și întoarce distanța cumulată (m). */
function runWalker(walker: Walker, ticks: number, input: WalkerInput): number {
  for (let index = 0; index < ticks; index += 1)
    walker.step({ tick: walker.state.tick + 1, input });
  return walker.stats.distanceM;
}

/** Criteriul 1, exhaustiv: fiecare submulțime a celor opt acțiuni, pe ambele autorități. */
function exhaustiveProof(): AuthorityReport['exhaustive'] {
  const combinationsPerAuthority = 1 << authorityActions.length;
  const authorities = [CHARACTER, VEHICLE] as const;
  let ticks = 0;
  let addressed = 0;
  let deliveredCharacter = 0;
  let deliveredVehicle = 0;
  let characterNonEmptyTicks = 0;
  let vehicleNonEmptyTicks = 0;
  let emptyTicks = 0;
  let simultaneousNonEmptyTicks = 0;
  let wrongConsumerDeliveries = 0;
  for (const authority of authorities) {
    for (let mask = 0; mask < combinationsPerAuthority; mask += 1) {
      const arbiter = createInputAuthorityArbiter({ context: CONTEXT, authority });
      for (let bit = 0; bit < authorityActions.length; bit += 1)
        if ((mask & (1 << bit)) !== 0) arbiter.setAction(authorityActions[bit], true);
      const result = arbiter.step({ tick: 1, characterYawRad: CHARACTER_YAW_RAD });
      const counter = countingPorts();
      arbiter.deliver(result, result.command.consumer, counter.ports);
      ticks += 1;
      if (counter.total === 1) addressed += 1;
      const other: AuthorityConsumer =
        result.command.consumer === 'CHARACTER' ? 'VEHICLE' : 'CHARACTER';
      if (counter.counts[result.command.consumer] !== 1 || counter.counts[other] !== 0)
        wrongConsumerDeliveries += 1;
      if (result.command.consumer === 'CHARACTER') deliveredCharacter += 1;
      else deliveredVehicle += 1;
      const nonEmpty = !isEmptyAuthorityCommand(result.command);
      if (!nonEmpty) emptyTicks += 1;
      else if (result.command.consumer === 'CHARACTER') characterNonEmptyTicks += 1;
      else vehicleNonEmptyTicks += 1;
      if (nonEmpty && counter.counts.CHARACTER > 0 && counter.counts.VEHICLE > 0)
        simultaneousNonEmptyTicks += 1;
      arbiter.dispose();
    }
  }
  return {
    combinationsPerAuthority,
    authorities: authorities.length,
    ticks,
    addressed,
    deliveredCharacter,
    deliveredVehicle,
    characterNonEmptyTicks,
    vehicleNonEmptyTicks,
    emptyTicks,
    simultaneousNonEmptyTicks,
    wrongConsumerDeliveries,
  };
}

/** Criteriul 1, forma runtime: livrarea dublă și livrarea către entitatea inactivă sunt refuzate. */
function deliveryProof(): AuthorityReport['delivery'] {
  const arbiter = createInputAuthorityArbiter({ context: CONTEXT, authority: CHARACTER });
  const counter = countingPorts();
  const codes: string[] = [];
  const attempt = (action: () => void): void => {
    try {
      action();
    } catch (error) {
      codes.push((error as { code?: string }).code ?? 'UNKNOWN');
    }
  };
  const first = arbiter.step({ tick: 1, characterYawRad: CHARACTER_YAW_RAD });
  arbiter.deliver(first, 'CHARACTER', counter.ports);
  // Aceeași comandă, a doua oară, către ambii consumatori: poarta de tick refuză.
  attempt(() => arbiter.deliver(first, 'CHARACTER', counter.ports));
  attempt(() => arbiter.deliver(first, 'VEHICLE', counter.ports));
  // Tick nou, țintă inactivă: refuz explicit, fără să atingă personajul.
  const second = arbiter.step({ tick: 2, characterYawRad: CHARACTER_YAW_RAD });
  attempt(() => arbiter.deliver(second, 'VEHICLE', counter.ports));
  // Rezultat vechi după un tick nou: refuz.
  arbiter.step({ tick: 3, characterYawRad: CHARACTER_YAW_RAD });
  attempt(() => arbiter.deliver(second, 'CHARACTER', counter.ports));
  const stats = arbiter.getStats();
  const result = {
    characterDeliveries: counter.counts.CHARACTER,
    vehicleDeliveries: counter.counts.VEHICLE,
    doubleDeliveryRefused: codes.filter((code) => code === 'DOUBLE_DELIVERY_REFUSED').length === 2,
    inactiveConsumerRefused: codes.includes('INACTIVE_CONSUMER_REFUSED'),
    staleResultRefused: codes.includes('STALE_RESULT'),
    codes: Object.freeze([...codes]),
    refused: stats.refused,
  };
  arbiter.dispose();
  return Object.freeze(result);
}

/** Criteriul 2: tastele ținute la tranziție nu produc nimic până la eliberare. */
function transitionRows(): readonly TransitionRow[] {
  const sets: readonly (readonly AuthorityAction[])[] = Object.freeze([
    ...authorityActions.map((action) => Object.freeze([action])),
    Object.freeze([...authorityActions]),
  ]);
  /** Comanda pe care aceeași setare de taste o produce fără nicio tranziție. */
  const control = (authority: InputAuthority, held: readonly AuthorityAction[]): string => {
    const probe = createInputAuthorityArbiter({ context: CONTEXT, authority });
    for (const action of held) probe.setAction(action, true);
    const result = probe.step({ tick: 1, characterYawRad: CHARACTER_YAW_RAD });
    probe.dispose();
    return summarizeAuthorityCommand(result);
  };
  const rows: TransitionRow[] = [];
  for (const direction of ['CHARACTER→VEHICLE', 'VEHICLE→CHARACTER'] as const) {
    const from = direction === 'CHARACTER→VEHICLE' ? CHARACTER : VEHICLE;
    const to = direction === 'CHARACTER→VEHICLE' ? VEHICLE : CHARACTER;
    for (const held of sets) {
      const arbiter = createInputAuthorityArbiter({ context: CONTEXT, authority: from });
      const counter = countingPorts();
      for (const action of held) arbiter.setAction(action, true);
      const before = arbiter.step({ tick: 1, characterYawRad: CHARACTER_YAW_RAD });
      arbiter.deliver(before, before.command.consumer, counter.ports);
      const transitioned = arbiter.setAuthority(to);
      const after = arbiter.step({ tick: 2, characterYawRad: CHARACTER_YAW_RAD });
      // Eliberare + reapăsare: intenția trebuie să redevină exact cea din control.
      for (const action of held) arbiter.setAction(action, false);
      for (const action of held) arbiter.setAction(action, true);
      const rearmed = arbiter.step({ tick: 3, characterYawRad: CHARACTER_YAW_RAD });
      const beforeEmpty = isEmptyAuthorityCommand(before.command);
      const afterEmpty = isEmptyAuthorityCommand(after.command);
      const rearmedEmpty = isEmptyAuthorityCommand(rearmed.command);
      const rearmedCommand = summarizeAuthorityCommand(rearmed);
      const controlCommand = control(to, held);
      const verdict: 'PASS' | 'FAIL' =
        transitioned &&
        afterEmpty &&
        after.command.consumer === to.consumer &&
        rearmed.command.consumer === to.consumer &&
        rearmedCommand === controlCommand
          ? 'PASS'
          : 'FAIL';
      rows.push({
        direction,
        held,
        transitioned,
        beforeCommand: summarizeAuthorityCommand(before),
        beforeEmpty,
        afterCommand: summarizeAuthorityCommand(after),
        afterEmpty,
        afterConsumer: after.command.consumer,
        rearmedCommand,
        rearmedEmpty,
        controlCommand,
        verdict,
      });
      arbiter.dispose();
    }
  }
  return Object.freeze(rows);
}

/** Starea serializabilă: JSON simplu, identitate păstrată, taste neutralizate la reluare. */
function stateProof(): AuthorityReport['state'] {
  const arbiter = createInputAuthorityArbiter({ context: CONTEXT, authority: VEHICLE });
  const counter = countingPorts();
  // Sesiune reală la mijlocul cursei: starea restaurată pornește de la tick-ul salvat.
  arbiter.restore({
    version: INPUT_AUTHORITY_CONTRACT_VERSION,
    tick: 40,
    authority: VEHICLE,
    held: [],
    neutralized: [],
    transitions: 1,
  });
  arbiter.setAction('throttle', true);
  arbiter.setAction('steerLeft', true);
  const first = arbiter.step({ tick: 41, characterYawRad: CHARACTER_YAW_RAD });
  arbiter.deliver(first, first.command.consumer, counter.ports);
  const snapshot: InputAuthoritySnapshot = arbiter.snapshot();
  const json = JSON.stringify(snapshot);
  const restored = createInputAuthorityArbiter({ context: CONTEXT, authority: CHARACTER });
  restored.restore(JSON.parse(json) as unknown);
  const after = restored.snapshot();
  const next = restored.step({ tick: 42, characterYawRad: CHARACTER_YAW_RAD });
  let restoreRefusals = 0;
  for (const invalid of [
    { ...JSON.parse(json), version: '193-input-authority-v0' },
    { ...JSON.parse(json), neutralized: ['sprint'] },
    { ...JSON.parse(json), tick: -1 },
    { ...JSON.parse(json), authority: { consumer: 'VEHICLE' } },
  ]) {
    const probe = createInputAuthorityArbiter({ context: CONTEXT, authority: CHARACTER });
    try {
      probe.restore(invalid);
    } catch {
      restoreRefusals += 1;
    }
    probe.dispose();
  }
  const result = {
    bytes: Buffer.byteLength(json, 'utf8'),
    keys: Object.freeze(Object.keys(snapshot)),
    authorityPreserved: after.authority.consumer === 'VEHICLE',
    tickPreserved: after.tick === 41,
    heldPreserved: after.held.join(',') === 'throttle,steerLeft',
    neutralizedOnRestore: after.neutralized.join(',') === after.held.join(','),
    firstTickAfterRestoreEmpty: isEmptyAuthorityCommand(next.command),
    firstTickAfterRestoreConsumer: next.command.consumer,
    plainJson: JSON.stringify(JSON.parse(json) as unknown) === json,
    restoreRefusals,
  };
  arbiter.dispose();
  restored.dispose();
  return Object.freeze(result);
}

function buildReport(): Omit<AuthorityReport, 'determinism'> {
  const focus = focusScenarioRow();
  const scenarios = Object.freeze([...scenarioSpecs.map((spec) => runScenario(spec)), focus.row]);
  const exhaustive = exhaustiveProof();
  const delivery = deliveryProof();
  const transitions = transitionRows();
  const state = stateProof();
  const scenariosPassed = scenarios.filter((entry) => entry.verdict === 'PASS').length;
  const transitionsPassed = transitions.filter((entry) => entry.verdict === 'PASS').length;
  const criterion1 =
    scenariosPassed === scenarios.length &&
    exhaustive.addressed === exhaustive.ticks &&
    exhaustive.simultaneousNonEmptyTicks === 0 &&
    exhaustive.wrongConsumerDeliveries === 0 &&
    exhaustive.characterNonEmptyTicks + exhaustive.vehicleNonEmptyTicks + exhaustive.emptyTicks ===
      exhaustive.ticks &&
    delivery.doubleDeliveryRefused &&
    delivery.inactiveConsumerRefused &&
    delivery.vehicleDeliveries === 0;
  const criterion2 =
    transitionsPassed === transitions.length &&
    transitions.every((entry) => entry.afterEmpty) &&
    transitions.every((entry) => entry.transitioned);
  const focusOk =
    focus.focus.fieldCommandEmpty &&
    focus.focus.fieldWalkerDistanceM === 0 &&
    focus.focus.fieldHeldKeys === 0 &&
    !focus.focus.resumedCommandEmpty &&
    focus.focus.resumedWalkerDistanceM > 0 &&
    focus.focus.listenersAfterDispose === 0;
  const serializable =
    state.authorityPreserved &&
    state.tickPreserved &&
    state.heldPreserved &&
    state.neutralizedOnRestore &&
    state.firstTickAfterRestoreEmpty &&
    state.firstTickAfterRestoreConsumer === 'VEHICLE' &&
    state.plainJson &&
    state.restoreRefusals === 4;
  return {
    generatedBy: 'scripts/run-v3-authority-report.mjs',
    command: AUTHORITY_REPORT_COMMAND,
    contract: AUTHORITY_REPORT_CONTRACT,
    tickHz: INPUT_AUTHORITY_TICK_HZ,
    reference: {
      context: CONTEXT,
      character: 'player-character',
      vehicle: 'taxi-193',
      actions: authorityActions,
      driveActions: authorityDriveActions,
      transitionRule: 'NEUTRALIZE_UNTIL_RELEASE',
      consumerOfEmptyCommand: 'ACTIVE_AUTHORITY_ONLY',
    },
    scenarios,
    exhaustive,
    delivery,
    transitions,
    focus: focus.focus,
    state,
    summary: {
      scenarios: scenarios.length,
      scenariosPassed,
      transitionRows: transitions.length,
      transitionsPassed,
      criterion1,
      criterion2,
      focus: focusOk,
      serializable,
      pass: criterion1 && criterion2 && focusOk && serializable,
    },
    limitations: [
      'Walker-ul 192 are doar mers înainte: axa negativă comandă oprirea, nu mers înapoi. Mersul înapoi și alergarea cu direcție inversă rămân în afara contractului 192.',
      'Virarea personajului este o direcție absolută derivată din fețarea curentă (±π/2 la capătul barei), nu un model de tanc cu viteză unghiulară proprie; urmărirea unghiului aparține walker-ului (12 rad/s).',
      'Arbitrajul nu citește tastatura: focusul, dialogurile și câmpurile de text sunt garantate de legarea 066 (`bindKeyboardDriveInput`), al cărei port este exact `arbiter.port`.',
      'Comutarea autorității este o decizie a compoziției (195 pentru intrarea în mașină, 194 pentru cameră); acest contract oferă tranziția, refuzurile și starea, nu proximitatea.',
      'Persistarea efectivă și migrarea sesiunilor V3 aparțin PBI 200; aici există doar snapshot-ul explicit, validat și determinist.',
      'Proba este headless: nu desenează camera third-person și nu măsoară latența percepută a tastelor.',
    ],
  };
}

/** Amprenta SHA-256 a raportului, fără câmpul de determinism. */
export function authorityReportDigest(report: Omit<AuthorityReport, 'determinism'>): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        generatedBy: report.generatedBy,
        command: report.command,
        contract: report.contract,
        tickHz: report.tickHz,
        reference: report.reference,
        scenarios: report.scenarios,
        exhaustive: report.exhaustive,
        delivery: report.delivery,
        transitions: report.transitions,
        focus: report.focus,
        state: report.state,
        summary: report.summary,
        limitations: report.limitations,
      }),
    )
    .digest('hex');
}

export function runAuthorityReport(): AuthorityReport {
  const first = buildReport();
  const second = buildReport();
  const identical = JSON.stringify(first) === JSON.stringify(second);
  return {
    ...first,
    determinism: { runs: 2, identical, digest: authorityReportDigest(first) },
  };
}
