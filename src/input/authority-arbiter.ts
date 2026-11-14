/**
 * PBI 193 — o singură autoritate de input: personajul sau vehiculul, niciodată amândouă.
 *
 * Modulul este pur, headless și determinist: fără DOM, fără ceas, fără `Math.random`, fără
 * servicii de simulare. El primește intenția brută (axele de mișcare + butoanele ținute) și
 * starea autorității (`CHARACTER` sau `VEHICLE:<id>`), apoi produce **exact o** comandă pentru
 * entitatea activă: `WalkerInput` (192) pentru personaj, `VehicleCommand` (024) pentru vehicul.
 *
 * Criteriul 1 este structural: `step` are o singură ieșire discriminată, iar `deliver` este
 * singurul canal către consumatori. O a doua livrare în același tick este refuzată cu
 * `DOUBLE_DELIVERY_REFUSED`, iar livrarea către entitatea inactivă cu
 * `INACTIVE_CONSUMER_REFUSED`.
 *
 * Criteriul 2 este despre tranziție: la schimbarea autorității, fiecare acțiune ținută în acel
 * moment este **neutralizată până la prima eliberare**. O accelerație ținută înainte de tranziție
 * nu produce deci nicio comandă non-zero la primul tick după tranziție.
 *
 * Focusul nu este duplicat aici: `port` este exact `KeyboardDrivePort` din 066, deci
 * `bindKeyboardDriveInput` alimentează arbitrajul cu intenții deja filtrate de focus, dialoguri,
 * câmpuri de text și pierderea ferestrei.
 */
import type { WalkerInput } from '../character';
import type { ContractContext } from '../sessions';
import type { KeyboardDriveAction, KeyboardDrivePort, VehicleCommand } from '../vehicles';

export const INPUT_AUTHORITY_CONTRACT_VERSION = '193-input-authority-v1' as const;

/** Aceeași rată ca tick-ul fizic 024/192; un pas de arbitraj aparține unui tick, nu unui cadru. */
export const INPUT_AUTHORITY_TICK_HZ = 60;

export const authorityConsumers = ['CHARACTER', 'VEHICLE'] as const;
export type AuthorityConsumer = (typeof authorityConsumers)[number];

/** Autoritatea activă. Este date pure, deci se poate salva și compara fără identitate de obiect. */
export type InputAuthority =
  | Readonly<{ consumer: 'CHARACTER'; characterId: string }>
  | Readonly<{ consumer: 'VEHICLE'; vehicleId: string }>;

/**
 * Vocabularul închis al intenției. Primele șapte acțiuni sunt exact `KeyboardDriveAction` din
 * 066, deci același binding fizic și același filtru de focus le pot alimenta pe ambele autorități.
 * `sprint` este singura acțiune proprie mersului și are propriul canal explicit.
 */
export const authorityDriveActions = [
  'throttle',
  'brake',
  'steerLeft',
  'steerRight',
  'handbrake',
  'signalLeft',
  'signalRight',
] as const satisfies readonly KeyboardDriveAction[];

export const authorityActions = [...authorityDriveActions, 'sprint'] as const;
export type AuthorityAction = (typeof authorityActions)[number];

export const INPUT_AUTHORITY_ERROR_CODES = [
  'INVALID_AUTHORITY',
  'INVALID_ACTION',
  'INVALID_TICK',
  'INVALID_REQUEST',
  'INVALID_STATE',
  'STALE_RESULT',
  'DOUBLE_DELIVERY_REFUSED',
  'INACTIVE_CONSUMER_REFUSED',
  'DISPOSED',
] as const;
export type InputAuthorityErrorCode = (typeof INPUT_AUTHORITY_ERROR_CODES)[number];

export class InputAuthorityError extends Error {
  readonly code: InputAuthorityErrorCode;
  constructor(code: InputAuthorityErrorCode, message: string) {
    super(message);
    this.name = 'InputAuthorityError';
    this.code = code;
  }
}

/** Intenția brută: două axe continue plus butoane. Nu conține entitate, tick sau mod. */
export interface InputIntent {
  /** Axa longitudinală: +1 înainte/accelerație, −1 frână/înapoi, 0 neutru. */
  readonly forward: number;
  /** Axa de virare: +1 dreapta, −1 stânga, 0 drept. */
  readonly turn: number;
  readonly sprint: boolean;
  readonly handbrake: boolean;
  readonly signalLeft: boolean;
  readonly signalRight: boolean;
}

export interface CharacterAuthorityCommand {
  readonly consumer: 'CHARACTER';
  readonly characterId: string;
  readonly input: WalkerInput;
}

export interface VehicleAuthorityCommand {
  readonly consumer: 'VEHICLE';
  readonly vehicleId: string;
  readonly command: VehicleCommand;
}

/** Exact una dintre cele două forme există la un tick; cealaltă ramură nu are câmp. */
export type AuthorityCommand = CharacterAuthorityCommand | VehicleAuthorityCommand;

export interface AuthorityTickRequest {
  /** Tick-ul fizic următor; orice altă valoare este refuzată. */
  readonly tick: number;
  /** Fețarea autoritară curentă a personajului (rad); se citește doar pentru `CHARACTER`. */
  readonly characterYawRad: number;
}

export interface AuthorityTickResult {
  readonly tick: number;
  readonly authority: InputAuthority;
  readonly intent: InputIntent;
  /** Acțiunile ținute încă neutralizate de regula de tranziție, în ordinea canonică. */
  readonly neutralized: readonly AuthorityAction[];
  readonly command: AuthorityCommand;
}

/** Consumatorii reali. Arbitrajul cheamă exact unul dintre ei pe tick. */
export interface AuthorityDeliveryPorts {
  readonly character: (command: CharacterAuthorityCommand) => void;
  readonly vehicle: (command: VehicleAuthorityCommand) => void;
}

/** Starea explicită, serializabilă, din care 200 poate salva și relua autoritatea. */
export interface InputAuthoritySnapshot {
  readonly version: typeof INPUT_AUTHORITY_CONTRACT_VERSION;
  readonly tick: number;
  readonly authority: InputAuthority;
  readonly held: readonly AuthorityAction[];
  readonly neutralized: readonly AuthorityAction[];
  readonly transitions: number;
}

export interface InputAuthorityStats {
  readonly tick: number;
  readonly authority: InputAuthority;
  readonly held: number;
  readonly neutralized: number;
  readonly transitions: number;
  readonly delivered: Readonly<{ CHARACTER: number; VEHICLE: number }>;
  readonly refused: Readonly<{
    doubleDelivery: number;
    inactiveConsumer: number;
    staleResult: number;
  }>;
  readonly disposed: boolean;
}

export interface InputAuthorityArbiter {
  readonly contract: typeof INPUT_AUTHORITY_CONTRACT_VERSION;
  /** Portul 066: se leagă direct la `bindKeyboardDriveInput`, fără adapter suplimentar. */
  readonly port: KeyboardDrivePort;
  setAction(action: AuthorityAction, pressed: boolean): void;
  setSprint(pressed: boolean): void;
  /** Eliberează tot (blur, câmp de UI, dialog). Neutralizarea se golește odată cu tastele. */
  releaseAll(): void;
  /** Schimbă autoritatea; `true` înseamnă tranziție reală. Aceeași autoritate este un no-op. */
  setAuthority(authority: InputAuthority): boolean;
  step(request: AuthorityTickRequest): AuthorityTickResult;
  /** Singurul canal către consumatori; refuză a doua livrare în același tick. */
  deliver(
    result: AuthorityTickResult,
    consumer: AuthorityConsumer,
    ports: AuthorityDeliveryPorts,
  ): void;
  snapshot(): InputAuthoritySnapshot;
  /** Reface starea salvată de 200; fiecare tastă ținută rămâne neutralizată până la eliberare. */
  restore(state: unknown): void;
  getStats(): InputAuthorityStats;
  dispose(): void;
}

export interface InputAuthorityOptions {
  readonly context: ContractContext;
  readonly authority: InputAuthority;
}

/** Unghiul maxim de virare cerut walker-ului când bara de virare este la capăt. */
export const AUTHORITY_CHARACTER_TURN_RAD = Math.PI / 2;

function fail(code: InputAuthorityErrorCode, message: string): never {
  throw new InputAuthorityError(code, message);
}

function requireContract(
  condition: boolean,
  code: InputAuthorityErrorCode,
  message: string,
): asserts condition {
  if (!condition) fail(code, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function textField(value: unknown, code: InputAuthorityErrorCode, label: string): string {
  requireContract(
    typeof value === 'string' && value.trim().length > 0 && value.length <= 256,
    code,
    `${label} must be a non-empty string of at most 256 code units`,
  );
  return value;
}

function tickField(value: unknown, code: InputAuthorityErrorCode, label: string): number {
  requireContract(
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0,
    code,
    `${label} must be a safe non-negative integer`,
  );
  return value;
}

function isAuthorityAction(value: unknown): value is AuthorityAction {
  return (authorityActions as readonly unknown[]).includes(value);
}

function canonicalActions(values: Iterable<AuthorityAction>): readonly AuthorityAction[] {
  const set = new Set(values);
  return Object.freeze(authorityActions.filter((action) => set.has(action)));
}

function sameAuthority(a: InputAuthority, b: InputAuthority): boolean {
  return (
    a.consumer === b.consumer &&
    (a.consumer === 'CHARACTER'
      ? a.characterId === (b as { characterId: string }).characterId
      : a.vehicleId === (b as { vehicleId: string }).vehicleId)
  );
}

function readAuthority(value: unknown): InputAuthority {
  if (!isRecord(value)) fail('INVALID_AUTHORITY', 'authority must be a plain object');
  const record = value;
  if (record.consumer !== 'CHARACTER' && record.consumer !== 'VEHICLE')
    fail('INVALID_AUTHORITY', 'authority consumer must be CHARACTER or VEHICLE');
  const keys = Object.keys(record);
  if (record.consumer === 'CHARACTER') {
    requireContract(
      keys.length === 2 && keys.includes('characterId'),
      'INVALID_AUTHORITY',
      'CHARACTER authority carries exactly consumer and characterId',
    );
    return Object.freeze({
      consumer: 'CHARACTER' as const,
      characterId: textField(record.characterId, 'INVALID_AUTHORITY', 'characterId'),
    });
  }
  requireContract(
    keys.length === 2 && keys.includes('vehicleId'),
    'INVALID_AUTHORITY',
    'VEHICLE authority carries exactly consumer and vehicleId',
  );
  return Object.freeze({
    consumer: 'VEHICLE' as const,
    vehicleId: textField(record.vehicleId, 'INVALID_AUTHORITY', 'vehicleId'),
  });
}

function readActionList(value: unknown, label: string): readonly AuthorityAction[] {
  requireContract(
    Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype,
    'INVALID_STATE',
    `${label} must be a plain array`,
  );
  const seen = new Set<AuthorityAction>();
  for (const entry of value) {
    requireContract(isAuthorityAction(entry), 'INVALID_ACTION', `unknown action in ${label}`);
    requireContract(!seen.has(entry), 'INVALID_STATE', `duplicate action in ${label}`);
    seen.add(entry);
  }
  return canonicalActions(seen);
}

function normalizeAngle(rad: number): number {
  const wrapped = (((rad + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return wrapped - Math.PI;
}

function finite(value: unknown, code: InputAuthorityErrorCode, label: string): number {
  requireContract(typeof value === 'number' && Number.isFinite(value), code, label);
  return value;
}

/**
 * Intenția brută: axele se compun din tastele ținute, mai puțin cele neutralizate. Două taste
 * opuse ținute simultan se anulează, exact ca în filtrul 066 (`throttle` și `brake` → 0).
 */
export function authorityIntent(
  held: readonly AuthorityAction[],
  neutralized: readonly AuthorityAction[] = [],
): InputIntent {
  const suppressed = new Set(neutralized);
  const active = new Set<AuthorityAction>();
  for (const action of held) if (!suppressed.has(action)) active.add(action);
  const forward = (active.has('throttle') ? 1 : 0) - (active.has('brake') ? 1 : 0);
  const turn = (active.has('steerRight') ? 1 : 0) - (active.has('steerLeft') ? 1 : 0);
  return Object.freeze({
    forward,
    turn,
    sprint: active.has('sprint'),
    handbrake: active.has('handbrake'),
    signalLeft: active.has('signalLeft'),
    signalRight: active.has('signalRight'),
  });
}

/**
 * Proiecția pe personaj. Walker-ul 192 are doar mers înainte, deci o axă negativă comandă
 * oprirea, nu mers înapoi; virarea cere o direcție absolută, calculată din fețarea curentă.
 */
export function authorityCharacterInput(intent: InputIntent, characterYawRad: number): WalkerInput {
  const yaw = finite(characterYawRad, 'INVALID_REQUEST', 'characterYawRad must be finite');
  const forward = finite(intent.forward, 'INVALID_REQUEST', 'intent.forward must be finite');
  const turn = finite(intent.turn, 'INVALID_REQUEST', 'intent.turn must be finite');
  const moving = forward > 0;
  return Object.freeze({
    headingRad: normalizeAngle(yaw + turn * AUTHORITY_CHARACTER_TURN_RAD),
    gait: moving ? (intent.sprint ? 'RUN' : 'WALK') : 'NONE',
    intensity: moving ? Math.min(1, forward) : 0,
  });
}

function turnSignalOf(intent: InputIntent): VehicleCommand['turnSignal'] {
  if (intent.signalLeft && intent.signalRight) return 'HAZARD';
  if (intent.signalLeft) return 'LEFT';
  if (intent.signalRight) return 'RIGHT';
  return 'OFF';
}

/** Proiecția pe vehicul: comanda 024, cu `source: 'PLAYER'`, fără rampă și fără stare. */
export function authorityVehicleCommand(
  intent: InputIntent,
  frame: { readonly context: ContractContext; readonly vehicleId: string; readonly tick: number },
): VehicleCommand {
  const forward = finite(intent.forward, 'INVALID_REQUEST', 'intent.forward must be finite');
  const turn = finite(intent.turn, 'INVALID_REQUEST', 'intent.turn must be finite');
  requireContract(
    forward >= -1 && forward <= 1 && turn >= -1 && turn <= 1,
    'INVALID_REQUEST',
    'intent axes must stay within −1…1',
  );
  return Object.freeze({
    ...frame.context,
    vehicleId: textField(frame.vehicleId, 'INVALID_AUTHORITY', 'vehicleId'),
    tick: tickField(frame.tick, 'INVALID_TICK', 'tick'),
    throttle: forward > 0 ? forward : 0,
    brake: forward < 0 ? -forward : 0,
    steering: turn,
    handbrake: intent.handbrake,
    turnSignal: turnSignalOf(intent),
    source: 'PLAYER' as const,
  });
}

/** Comanda vidă a personajului: gait NONE sau intensitate zero nu mișcă entitatea. */
export function isCharacterCommandEmpty(command: CharacterAuthorityCommand): boolean {
  return command.input.gait === 'NONE' || command.input.intensity === 0;
}

/** Comanda vidă a vehiculului: nicio accelerație, frână, virare, frână de mână sau semnal. */
export function isVehicleCommandEmpty(command: VehicleAuthorityCommand): boolean {
  const data = command.command;
  return (
    data.throttle === 0 &&
    data.brake === 0 &&
    data.steering === 0 &&
    data.handbrake === false &&
    data.turnSignal === 'OFF'
  );
}

export function isEmptyAuthorityCommand(command: AuthorityCommand): boolean {
  return command.consumer === 'CHARACTER'
    ? isCharacterCommandEmpty(command)
    : isVehicleCommandEmpty(command);
}

/**
 * Singurul arbitru. Starea este formată din autoritate, tastele ținute, cele neutralizate și tick;
 * nu există câmp ascuns, ceas sau sursă aleatoare.
 */
export function createInputAuthorityArbiter(options: InputAuthorityOptions): InputAuthorityArbiter {
  requireContract(isRecord(options), 'INVALID_REQUEST', 'arbiter options are required');
  const context: ContractContext = Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    sessionId: textField(options.context?.sessionId, 'INVALID_REQUEST', 'sessionId'),
    worldEpoch: tickField(options.context?.worldEpoch, 'INVALID_REQUEST', 'worldEpoch'),
  });
  let authority = readAuthority(options.authority);
  let currentTick = 0;
  let transitions = 0;
  let lastDeliveryTick: number | null = null;
  let disposed = false;
  let held = new Set<AuthorityAction>();
  let neutralized = new Set<AuthorityAction>();
  const delivered = { CHARACTER: 0, VEHICLE: 0 };
  const refused = { doubleDelivery: 0, inactiveConsumer: 0, staleResult: 0 };

  const active = (): void => {
    requireContract(!disposed, 'DISPOSED', 'input authority arbiter is disposed');
  };

  const apply = (action: unknown, pressed: unknown): void => {
    active();
    requireContract(isAuthorityAction(action), 'INVALID_ACTION', 'unknown authority action');
    requireContract(typeof pressed === 'boolean', 'INVALID_ACTION', 'pressed must be a boolean');
    if (pressed) {
      held.add(action);
      return;
    }
    held.delete(action);
    // Eliberarea este singurul eveniment care ridică neutralizarea: o tastă reapăsată după
    // eliberare redevine activă, una ținută peste tranziție rămâne neutralizată.
    neutralized.delete(action);
  };

  const releaseAll = (): void => {
    active();
    held = new Set();
    neutralized = new Set();
  };

  const arbiter: InputAuthorityArbiter = {
    contract: INPUT_AUTHORITY_CONTRACT_VERSION,
    port: Object.freeze({
      setAction(action: KeyboardDriveAction, pressed: boolean) {
        apply(action, pressed);
      },
      clear() {
        releaseAll();
      },
    }),
    setAction(action, pressed) {
      apply(action, pressed);
    },
    setSprint(pressed) {
      apply('sprint', pressed);
    },
    releaseAll,
    setAuthority(next) {
      active();
      const candidate = readAuthority(next);
      if (sameAuthority(candidate, authority)) return false;
      authority = candidate;
      // Regula criteriului 2: tot ce era ținut la tranziție devine inactiv până la eliberare.
      neutralized = new Set(held);
      transitions += 1;
      return true;
    },
    step(request) {
      active();
      requireContract(isRecord(request), 'INVALID_REQUEST', 'tick request is required');
      const tick = tickField(request.tick, 'INVALID_TICK', 'tick');
      requireContract(
        tick === currentTick + 1,
        'INVALID_TICK',
        `tick must be the next fixed tick (${currentTick + 1}), received ${tick}`,
      );
      const yaw = finite(request.characterYawRad, 'INVALID_REQUEST', 'characterYawRad');
      const intent = authorityIntent([...held], [...neutralized]);
      const command: AuthorityCommand =
        authority.consumer === 'CHARACTER'
          ? Object.freeze({
              consumer: 'CHARACTER' as const,
              characterId: authority.characterId,
              input: authorityCharacterInput(intent, yaw),
            })
          : Object.freeze({
              consumer: 'VEHICLE' as const,
              vehicleId: authority.vehicleId,
              command: authorityVehicleCommand(intent, {
                context,
                vehicleId: authority.vehicleId,
                tick,
              }),
            });
      currentTick = tick;
      lastDeliveryTick = null;
      return Object.freeze({
        tick,
        authority,
        intent,
        neutralized: canonicalActions(neutralized),
        command,
      });
    },
    deliver(result, consumer, ports) {
      active();
      requireContract(
        isRecord(result) && isRecord(result.command),
        'INVALID_REQUEST',
        'a produced tick result is required',
      );
      requireContract(
        consumer === 'CHARACTER' || consumer === 'VEHICLE',
        'INVALID_REQUEST',
        'unknown delivery consumer',
      );
      requireContract(
        isRecord(ports) &&
          typeof ports.character === 'function' &&
          typeof ports.vehicle === 'function',
        'INVALID_REQUEST',
        'both delivery ports are required',
      );
      if (result.tick !== currentTick) {
        refused.staleResult += 1;
        fail(
          'STALE_RESULT',
          `only the current tick (${currentTick}) can be delivered, received ${String(result.tick)}`,
        );
      }
      // Poarta de tick se verifică înaintea țintei: o a doua livrare, către orice consumator,
      // este refuzată explicit, deci personajul și vehiculul nu pot primi comenzi simultan.
      if (lastDeliveryTick === result.tick) {
        refused.doubleDelivery += 1;
        fail(
          'DOUBLE_DELIVERY_REFUSED',
          `tick ${result.tick} already delivered; one consumer per tick`,
        );
      }
      if (consumer !== result.command.consumer) {
        refused.inactiveConsumer += 1;
        fail(
          'INACTIVE_CONSUMER_REFUSED',
          `${consumer} is not the active authority (${result.command.consumer})`,
        );
      }
      lastDeliveryTick = result.tick;
      if (result.command.consumer === 'CHARACTER') {
        delivered.CHARACTER += 1;
        ports.character(result.command);
      } else {
        delivered.VEHICLE += 1;
        ports.vehicle(result.command);
      }
    },
    snapshot() {
      return Object.freeze({
        version: INPUT_AUTHORITY_CONTRACT_VERSION,
        tick: currentTick,
        authority,
        held: canonicalActions(held),
        neutralized: canonicalActions(neutralized),
        transitions,
      });
    },
    restore(state) {
      active();
      if (!isRecord(state)) fail('INVALID_STATE', 'saved state must be a plain object');
      requireContract(
        state.version === INPUT_AUTHORITY_CONTRACT_VERSION,
        'INVALID_STATE',
        'unsupported input authority state version',
      );
      const keys = Object.keys(state);
      requireContract(
        keys.length === 6 &&
          ['version', 'tick', 'authority', 'held', 'neutralized', 'transitions'].every((key) =>
            keys.includes(key),
          ),
        'INVALID_STATE',
        'saved state carries exactly version, tick, authority, held, neutralized, transitions',
      );
      const nextTick = tickField(state.tick, 'INVALID_STATE', 'state.tick');
      const nextAuthority = readAuthority(state.authority);
      const nextHeld = readActionList(state.held, 'state.held');
      const nextNeutralized = readActionList(state.neutralized, 'state.neutralized');
      for (const action of nextNeutralized)
        requireContract(
          nextHeld.includes(action),
          'INVALID_STATE',
          `state.neutralized must be a subset of state.held (${action})`,
        );
      authority = nextAuthority;
      currentTick = nextTick;
      transitions = tickField(state.transitions, 'INVALID_STATE', 'state.transitions');
      held = new Set(nextHeld);
      // La reluare nu există adevăr fizic: orice tastă salvată ca ținută rămâne neutralizată.
      neutralized = new Set(nextHeld);
      lastDeliveryTick = null;
    },
    getStats() {
      return Object.freeze({
        tick: currentTick,
        authority,
        held: held.size,
        neutralized: neutralized.size,
        transitions,
        delivered: Object.freeze({ ...delivered }),
        refused: Object.freeze({ ...refused }),
        disposed,
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      held = new Set();
      neutralized = new Set();
      lastDeliveryTick = null;
    },
  };
  return Object.freeze(arbiter);
}
