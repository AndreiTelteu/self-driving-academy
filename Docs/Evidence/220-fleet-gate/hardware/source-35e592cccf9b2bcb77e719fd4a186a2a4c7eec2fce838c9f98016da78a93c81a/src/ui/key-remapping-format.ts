import type { InputAction } from '../settings';

/**
 * 080 key remapping contract.
 *
 * This module owns a *device/settings* draft, never a learned profile. Bindings are the same
 * `input.bindings` record that 009 persists; this module neither imports `src/profiles` nor writes a
 * profile, a parameter or a learned value. A draft only proposes key codes: the host decides when
 * `SettingsStore.replace` is called.
 *
 * The supported-code grammar is an exact copy of `parseInputPreferences` in `src/settings`. Only
 * `KeyboardEvent.code` values are accepted; `event.key`, printable characters, modifier-only keys
 * and browser-reserved keys are rejected with a closed reason.
 */
export const KEY_REMAPPING_VERSION = '080-key-remapping-v1' as const;

/**
 * Same source text as the 009 `parseInputPreferences` guard. Kept as one exported value so the UI,
 * the tests and the report validate the same closed keyboard grammar.
 */
export const KEY_REMAPPING_CODE_PATTERN =
  /^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Space|Tab|Escape|Enter|Backspace|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|F([1-9]|1[0-2]))$/;

/**
 * The 15 public 009 actions, in settings order. The type is imported from 009, so a renamed or
 * removed action makes this file fail typecheck instead of silently drifting.
 */
export const KEY_REMAPPING_ACTIONS = [
  'throttle',
  'brake',
  'steerLeft',
  'steerRight',
  'handbrake',
  'manualMode',
  'learningMode',
  'kpis',
  'fleet',
  'signalLeft',
  'signalRight',
  'camera',
  'profile',
  'pause',
  'recover',
] as const satisfies readonly InputAction[];

export type KeyRemappingAction = (typeof KEY_REMAPPING_ACTIONS)[number];

/** Actions that must stay reachable while driving; they are always present and never unbound. */
export const KEY_REMAPPING_CRITICAL_ACTIONS = [
  'throttle',
  'brake',
  'steerLeft',
  'steerRight',
  'handbrake',
  'manualMode',
  'learningMode',
  'pause',
  'recover',
] as const satisfies readonly KeyRemappingAction[];

export const KEY_REMAPPING_REJECTIONS = [
  'UNSUPPORTED_CODE',
  'MODIFIER_ONLY',
  'RESERVED_BROWSER_CODE',
  'EMPTY',
] as const;
export type KeyRemappingRejection = (typeof KEY_REMAPPING_REJECTIONS)[number];

export type KeyRemappingRowState = 'VALID' | 'CONFLICT' | 'UNSUPPORTED' | 'UNCHANGED';
export type KeyRemappingSaveState = 'DIRTY' | 'CONFLICT' | 'UNSUPPORTED' | 'UNCHANGED';
export type KeyRemappingStatus = 'SET' | 'CLEARED' | 'RESET' | 'REVERTED' | 'REJECTED';

export const KEY_REMAPPING_LIMITS = Object.freeze({
  version: KEY_REMAPPING_VERSION,
  actions: KEY_REMAPPING_ACTIONS.length,
  /** Code units per `playerId` read from a draft. */
  idCodeUnits: 512,
  /** A draft is one in-memory row set; no history and no profile copy is retained. */
  retainedDrafts: 1,
  history: 0,
});

export const KEY_REMAPPING_LABELS: Readonly<Record<KeyRemappingAction, string>> = Object.freeze({
  throttle: 'Accelerație',
  brake: 'Frână',
  steerLeft: 'Direcție stânga',
  steerRight: 'Direcție dreapta',
  handbrake: 'Frână de mână',
  manualMode: 'Mod AUTO/MANUAL',
  learningMode: 'Mod LEARNING',
  kpis: 'Panou KPI',
  fleet: 'Lista flotei',
  signalLeft: 'Semnalizare stânga',
  signalRight: 'Semnalizare dreapta',
  camera: 'Cameră',
  profile: 'Panou profil',
  pause: 'Pauză',
  recover: 'Recuperare',
});

export const KEY_REMAPPING_STATE_LABELS: Readonly<Record<KeyRemappingRowState, string>> =
  Object.freeze({
    VALID: 'Modificat',
    CONFLICT: 'Conflict',
    UNSUPPORTED: 'Tastă invalidă',
    UNCHANGED: 'Neschimbat',
  });

export const KEY_REMAPPING_STATE_SYMBOLS: Readonly<Record<KeyRemappingRowState, string>> =
  Object.freeze({
    VALID: '✎',
    CONFLICT: '⚠',
    UNSUPPORTED: '✕',
    UNCHANGED: '=',
  });

export const KEY_REMAPPING_REJECTION_LABELS: Readonly<Record<KeyRemappingRejection, string>> =
  Object.freeze({
    UNSUPPORTED_CODE:
      'Tasta nu este acceptată; folosește litere, cifre, săgeți, Space/Tab/Escape/Enter/Backspace, Shift/Ctrl/Alt sau F1–F12.',
    MODIFIER_ONLY: 'Tastele modificator singure nu pot fi atribuite unei comenzi.',
    RESERVED_BROWSER_CODE: 'Tasta este rezervată de browser și nu poate fi capturată stabil.',
    EMPTY: 'Nicio tastă atribuită.',
  });

/**
 * Browser chrome shortcuts whose default action the page cannot reliably suppress. They stay valid
 * in a previously persisted 009 settings record, but a new capture never accepts them.
 */
export const KEY_REMAPPING_RESERVED_CODES: readonly string[] = Object.freeze([
  'F1',
  'F3',
  'F5',
  'F6',
  'F7',
  'F10',
  'F11',
  'F12',
]);

/** `event.key` names and unsupported physical modifier codes that must never become a binding. */
export const KEY_REMAPPING_MODIFIER_ONLY: readonly string[] = Object.freeze([
  'Shift',
  'Control',
  'Ctrl',
  'Alt',
  'AltGraph',
  'Meta',
  'OS',
  'Super',
  'Hyper',
  'Fn',
  'FnLock',
  'CapsLock',
  'NumLock',
  'ScrollLock',
  'Symbol',
  'SymbolLock',
  'MetaLeft',
  'MetaRight',
  'OSLeft',
  'OSRight',
]);

export interface KeyRemappingCodeAccepted {
  readonly ok: true;
  readonly code: string;
  readonly reason: null;
}

export interface KeyRemappingCodeRejected {
  readonly ok: false;
  readonly code: null;
  readonly reason: KeyRemappingRejection;
}

export type KeyRemappingCodeResult = KeyRemappingCodeAccepted | KeyRemappingCodeRejected;

const accepted = (code: string): KeyRemappingCodeAccepted =>
  Object.freeze({ ok: true as const, code, reason: null });
const rejected = (reason: KeyRemappingRejection): KeyRemappingCodeRejected =>
  Object.freeze({ ok: false as const, code: null, reason });

/**
 * Validates one `KeyboardEvent.code`. `event.key` (for example `"w"`, `"Shift"` or `" "`) is never a
 * valid input: only the closed physical-code grammar of 009 is accepted.
 */
export function normalizeKeyCode(value: unknown): KeyRemappingCodeResult {
  if (typeof value !== 'string' || value.trim() === '') return rejected('EMPTY');
  if (KEY_REMAPPING_MODIFIER_ONLY.includes(value)) return rejected('MODIFIER_ONLY');
  if (!KEY_REMAPPING_CODE_PATTERN.test(value)) return rejected('UNSUPPORTED_CODE');
  if (KEY_REMAPPING_RESERVED_CODES.includes(value)) return rejected('RESERVED_BROWSER_CODE');
  return accepted(value);
}

/** True for a code that 009 accepts as a persisted binding (reserved browser keys included). */
export function isSupportedKeyCode(value: unknown): value is string {
  return typeof value === 'string' && KEY_REMAPPING_CODE_PATTERN.test(value);
}

export function isCriticalKeyAction(action: KeyRemappingAction): boolean {
  return (KEY_REMAPPING_CRITICAL_ACTIONS as readonly string[]).includes(action);
}

/** Human label for one physical code; an empty proposal is explicitly "Nicio tastă". */
export function formatKeyCode(code: string): string {
  if (code === '') return 'Nicio tastă';
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter !== null) return letter[1]!;
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit !== null) return digit[1]!;
  switch (code) {
    case 'ArrowUp':
      return '↑';
    case 'ArrowDown':
      return '↓';
    case 'ArrowLeft':
      return '←';
    case 'ArrowRight':
      return '→';
    case 'ShiftLeft':
      return 'Shift stânga';
    case 'ShiftRight':
      return 'Shift dreapta';
    case 'ControlLeft':
      return 'Ctrl stânga';
    case 'ControlRight':
      return 'Ctrl dreapta';
    case 'AltLeft':
      return 'Alt stânga';
    case 'AltRight':
      return 'Alt dreapta';
    default:
      return code;
  }
}

/** A device/settings draft. It is never a profile, a learned parameter or a telemetry record. */
export interface KeyRemappingDraft {
  readonly schemaVersion: 1;
  readonly version: typeof KEY_REMAPPING_VERSION;
  readonly playerId: string;
  /** Persisted 009 bindings that the draft started from. */
  readonly bindings: Readonly<Record<KeyRemappingAction, string>>;
  /** Real defaults for the same player, injected from `createDefaultSettings`. */
  readonly defaults: Readonly<Record<KeyRemappingAction, string>>;
  /** Proposed codes, in the same action order. `''` is an explicit unbound action. */
  readonly proposed: Readonly<Record<KeyRemappingAction, string>>;
  /** Closed rejection for a proposed value; an entry always has `proposed[action] === ''`. */
  readonly rejections: Readonly<Partial<Record<KeyRemappingAction, KeyRemappingRejection>>>;
  readonly revision: number;
}

export interface KeyRemappingDraftInput {
  readonly playerId: string;
  readonly bindings: Readonly<Record<KeyRemappingAction, string>>;
  readonly defaults: Readonly<Record<KeyRemappingAction, string>>;
}

export interface KeyRemappingRow {
  readonly action: KeyRemappingAction;
  readonly label: string;
  readonly current: string;
  readonly currentLabel: string;
  readonly defaultCode: string;
  readonly defaultLabel: string;
  readonly proposed: string;
  readonly proposedLabel: string;
  readonly critical: boolean;
  readonly state: KeyRemappingRowState;
  readonly stateLabel: string;
  readonly stateSymbol: string;
  /** Other actions bound to the same proposed code; empty unless this row is a conflict. */
  readonly conflictWith: readonly KeyRemappingAction[];
  /** Inline conflict/unsupported text, `null` for a usable row. */
  readonly message: string | null;
  readonly description: string;
}

export interface KeyRemappingConflict {
  readonly code: string;
  readonly codeLabel: string;
  readonly actions: readonly KeyRemappingAction[];
  readonly labels: readonly string[];
  readonly message: string;
}

export interface KeyRemappingProjection {
  readonly version: typeof KEY_REMAPPING_VERSION;
  readonly playerId: string;
  readonly revision: number;
  readonly rows: readonly KeyRemappingRow[];
  readonly conflicts: readonly KeyRemappingConflict[];
  readonly saveState: KeyRemappingSaveState;
  readonly canSave: boolean;
  readonly changed: number;
  readonly critical: number;
  readonly summary: string;
  readonly signature: string;
}

export interface KeyRemappingResult {
  readonly draft: KeyRemappingDraft;
  readonly status: KeyRemappingStatus;
  readonly reason: KeyRemappingRejection | null;
}

// ---------------------------------------------------------------------------------------------
// Strict draft validation. Mirrors the 073/075 parser style: plain data only, no accessors.
// ---------------------------------------------------------------------------------------------

function fail(message: string): never {
  throw new Error(message);
}

function plain(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(`${label} must be plain data`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(`${label} must be plain data`);
  return value as Record<string, unknown>;
}

function requireDescriptors(data: Record<string, unknown>, keys: readonly string[], label: string) {
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(data, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
      fail(`${label} descriptors`);
  }
}

function exact(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  const data = plain(value, label),
    names = Reflect.ownKeys(data);
  if (
    names.length !== keys.length ||
    names.some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    fail(`${label} fields`);
  requireDescriptors(data, keys, label);
  return data;
}

function playerId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.trim() !== value ||
    value === '' ||
    value.length > KEY_REMAPPING_LIMITS.idCodeUnits
  )
    fail('Key remapping player identity');
  return value;
}

function revision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    fail('Key remapping revision');
  return value;
}

function bindingRecord(
  value: unknown,
  label: string,
): Readonly<Record<KeyRemappingAction, string>> {
  const data = exact(value, KEY_REMAPPING_ACTIONS, label),
    codes: Record<string, string> = {};
  for (const action of KEY_REMAPPING_ACTIONS) {
    const code = data[action];
    if (!isSupportedKeyCode(code)) fail(`${label} code`);
    codes[action] = code;
  }
  if (new Set(Object.values(codes)).size !== KEY_REMAPPING_ACTIONS.length)
    fail(`${label} conflict`);
  return Object.freeze(codes as Record<KeyRemappingAction, string>);
}

function proposedRecord(value: unknown): Readonly<Record<KeyRemappingAction, string>> {
  const data = exact(value, KEY_REMAPPING_ACTIONS, 'Key remapping proposed'),
    codes: Record<string, string> = {};
  for (const action of KEY_REMAPPING_ACTIONS) {
    const code = data[action];
    if (code === '') {
      codes[action] = '';
      continue;
    }
    const normalized = normalizeKeyCode(code);
    if (!normalized.ok) fail('Key remapping proposed code');
    codes[action] = normalized.code;
  }
  return Object.freeze(codes as Record<KeyRemappingAction, string>);
}

function rejectionRecord(
  value: unknown,
  proposed: Readonly<Record<KeyRemappingAction, string>>,
): Readonly<Partial<Record<KeyRemappingAction, KeyRemappingRejection>>> {
  const data = plain(value, 'Key remapping rejections'),
    names = Reflect.ownKeys(data);
  if (names.some((key) => typeof key !== 'string' || !KEY_REMAPPING_ACTIONS.includes(key as never)))
    fail('Key remapping rejection action');
  const reasons: Record<string, KeyRemappingRejection> = {};
  for (const name of names) {
    const action = name as KeyRemappingAction,
      reason = data[action];
    if (!KEY_REMAPPING_REJECTIONS.includes(reason as KeyRemappingRejection))
      fail('Key remapping rejection reason');
    if (proposed[action] !== '') fail('Key remapping rejection requires an unbound action');
    reasons[action] = reason as KeyRemappingRejection;
  }
  requireDescriptors(data, names as string[], 'Key remapping rejections');
  return Object.freeze(reasons as Partial<Record<KeyRemappingAction, KeyRemappingRejection>>);
}

/** Validates and freezes one draft before the adapter touches the DOM or the host saves it. */
export function parseKeyRemappingDraft(value: unknown): KeyRemappingDraft {
  if (!value || typeof value !== 'object') fail('Key remapping draft must be plain data');
  const data = exact(
      value,
      [
        'schemaVersion',
        'version',
        'playerId',
        'bindings',
        'defaults',
        'proposed',
        'rejections',
        'revision',
      ],
      'Key remapping draft',
    ),
    bindings = bindingRecord(data.bindings, 'Key remapping bindings'),
    defaults = bindingRecord(data.defaults, 'Key remapping defaults'),
    proposed = proposedRecord(data.proposed),
    rejections = rejectionRecord(data.rejections, proposed);
  if (data.schemaVersion !== 1 || data.version !== KEY_REMAPPING_VERSION)
    fail('Key remapping contract');
  return Object.freeze({
    schemaVersion: 1,
    version: KEY_REMAPPING_VERSION,
    playerId: playerId(data.playerId),
    bindings,
    defaults,
    proposed,
    rejections,
    revision: revision(data.revision),
  });
}

/** Builds the initial draft from the persisted bindings and the real defaults of the same player. */
export function createKeyRemappingDraft(input: KeyRemappingDraftInput): KeyRemappingDraft {
  if (!input || typeof input !== 'object') fail('Key remapping draft input');
  const bindings = bindingRecord(input.bindings, 'Key remapping bindings'),
    defaults = bindingRecord(input.defaults, 'Key remapping defaults');
  return parseKeyRemappingDraft({
    schemaVersion: 1,
    version: KEY_REMAPPING_VERSION,
    playerId: playerId(input.playerId),
    bindings,
    defaults,
    proposed: bindings,
    rejections: {},
    revision: 0,
  });
}

// ---------------------------------------------------------------------------------------------
// Pure operations
// ---------------------------------------------------------------------------------------------

function nextDraft(
  draft: KeyRemappingDraft,
  changes: {
    readonly proposed?: Readonly<Record<KeyRemappingAction, string>>;
    readonly rejections?: Readonly<Partial<Record<KeyRemappingAction, KeyRemappingRejection>>>;
    readonly revision?: number;
  },
): KeyRemappingDraft {
  return parseKeyRemappingDraft({
    schemaVersion: 1,
    version: KEY_REMAPPING_VERSION,
    playerId: draft.playerId,
    bindings: draft.bindings,
    defaults: draft.defaults,
    proposed: changes.proposed ?? draft.proposed,
    rejections: changes.rejections ?? draft.rejections,
    revision: changes.revision ?? draft.revision + 1,
  });
}

function assertAction(action: unknown): KeyRemappingAction {
  if (typeof action !== 'string' || !KEY_REMAPPING_ACTIONS.includes(action as never))
    fail('Key remapping action');
  return action as KeyRemappingAction;
}

/**
 * Proposes one captured code. A rejected code is never dropped silently: the row becomes an explicit
 * `UNSUPPORTED` row with an empty proposal and a closed rejection reason, so `saveState` blocks save.
 */
export function setBinding(
  draft: KeyRemappingDraft,
  actionValue: KeyRemappingAction,
  code: unknown,
): KeyRemappingResult {
  const current = parseKeyRemappingDraft(draft),
    action = assertAction(actionValue),
    normalized = normalizeKeyCode(code);
  if (normalized.ok) {
    if (current.proposed[action] === normalized.code && current.rejections[action] === undefined)
      return Object.freeze({ draft: current, status: 'SET' as const, reason: null });
    const proposed = { ...current.proposed, [action]: normalized.code },
      rejections = { ...current.rejections };
    delete rejections[action];
    return Object.freeze({
      draft: nextDraft(current, { proposed, rejections }),
      status: 'SET' as const,
      reason: null,
    });
  }
  const proposed = { ...current.proposed, [action]: '' },
    rejections = { ...current.rejections, [action]: normalized.reason };
  return Object.freeze({
    draft: nextDraft(current, { proposed, rejections }),
    status: 'REJECTED' as const,
    reason: normalized.reason,
  });
}

/**
 * Explicitly leaves one action unbound. The row stays present and invalid (`UNSUPPORTED`) until the
 * user assigns a valid code; it is never removed from the list and never silently remapped.
 */
export function clearBinding(
  draft: KeyRemappingDraft,
  actionValue: KeyRemappingAction,
): KeyRemappingDraft {
  const current = parseKeyRemappingDraft(draft),
    action = assertAction(actionValue),
    proposed = { ...current.proposed, [action]: '' },
    rejections = { ...current.rejections };
  delete rejections[action];
  return nextDraft(current, { proposed, rejections });
}

/** Proposes the real 009 defaults again. Saving remains an explicit host action. */
export function resetBindings(draft: KeyRemappingDraft): KeyRemappingDraft {
  const current = parseKeyRemappingDraft(draft);
  return nextDraft(current, {
    proposed: { ...current.defaults },
    rejections: {},
  });
}

/** Discards every local change; the persisted bindings become the proposal again. */
export function revertBindings(draft: KeyRemappingDraft): KeyRemappingDraft {
  const current = parseKeyRemappingDraft(draft);
  return nextDraft(current, {
    proposed: { ...current.bindings },
    rejections: {},
  });
}

/** The complete proposed binding record, ready for one `save(bindings)` intent. */
export function keyRemappingBindings(
  draft: KeyRemappingDraft,
): Readonly<Record<KeyRemappingAction, string>> {
  const current = parseKeyRemappingDraft(draft);
  return Object.freeze({ ...current.proposed });
}

export function keyRemappingHasChanges(draft: KeyRemappingDraft): boolean {
  const current = parseKeyRemappingDraft(draft);
  return KEY_REMAPPING_ACTIONS.some(
    (action) => current.proposed[action] !== current.bindings[action],
  );
}

function unsupportedMessage(rejection: KeyRemappingRejection | undefined): string {
  return KEY_REMAPPING_REJECTION_LABELS[rejection ?? 'EMPTY'];
}

/**
 * Pure projection used by the DOM adapter, the tests and the evidence report. Every code bound to
 * more than one action is a conflict; the draft cannot be saved while any row is conflicting,
 * unsupported or unbound. All 15 actions are always present.
 */
export function projectKeyRemapping(draft: KeyRemappingDraft): KeyRemappingProjection {
  const current = parseKeyRemappingDraft(draft),
    byCode = new Map<string, KeyRemappingAction[]>();
  for (const action of KEY_REMAPPING_ACTIONS) {
    const code = current.proposed[action];
    if (code === '') continue;
    const actions = byCode.get(code);
    if (actions === undefined) byCode.set(code, [action]);
    else actions.push(action);
  }
  const conflicts: KeyRemappingConflict[] = [];
  for (const [code, actions] of byCode) {
    if (actions.length < 2) continue;
    const labels = actions.map((action) => KEY_REMAPPING_LABELS[action]);
    conflicts.push(
      Object.freeze({
        code,
        codeLabel: formatKeyCode(code),
        actions: Object.freeze([...actions]),
        labels: Object.freeze([...labels]),
        message: `Tasta ${formatKeyCode(code)} este atribuită comenzilor ${labels.join(', ')}.`,
      }),
    );
  }
  conflicts.sort((left, right) => (left.code < right.code ? -1 : left.code > right.code ? 1 : 0));
  let changed = 0,
    critical = 0;
  const rows = KEY_REMAPPING_ACTIONS.map((action): KeyRemappingRow => {
    const proposed = current.proposed[action],
      rejection = current.rejections[action],
      sharing = proposed === '' ? [] : (byCode.get(proposed) ?? []),
      conflictWith = sharing.filter((other) => other !== action),
      state: KeyRemappingRowState =
        proposed === '' || rejection !== undefined
          ? 'UNSUPPORTED'
          : conflictWith.length > 0
            ? 'CONFLICT'
            : proposed === current.bindings[action]
              ? 'UNCHANGED'
              : 'VALID',
      label = KEY_REMAPPING_LABELS[action],
      currentLabel = formatKeyCode(current.bindings[action]),
      defaultCode = current.defaults[action],
      defaultLabel = formatKeyCode(defaultCode),
      proposedLabel = formatKeyCode(proposed),
      message =
        state === 'UNSUPPORTED'
          ? unsupportedMessage(rejection)
          : state === 'CONFLICT'
            ? `Tasta ${proposedLabel} este folosită și de ${conflictWith
                .map((other) => KEY_REMAPPING_LABELS[other])
                .join(', ')}.`
            : null,
      description = [
        `${label}: tasta curentă ${currentLabel}`,
        `propusă ${proposedLabel}`,
        `implicit ${defaultLabel}`,
        KEY_REMAPPING_STATE_LABELS[state],
        ...(message === null ? [] : [message]),
      ].join(', ');
    if (proposed !== current.bindings[action]) changed += 1;
    if (isCriticalKeyAction(action)) critical += 1;
    return Object.freeze({
      action,
      label,
      current: current.bindings[action],
      currentLabel,
      defaultCode,
      defaultLabel,
      proposed,
      proposedLabel,
      critical: isCriticalKeyAction(action),
      state,
      stateLabel: KEY_REMAPPING_STATE_LABELS[state],
      stateSymbol: KEY_REMAPPING_STATE_SYMBOLS[state],
      conflictWith: Object.freeze([...conflictWith]),
      message,
      description,
    });
  });
  const unsupported = rows.filter((row) => row.state === 'UNSUPPORTED').length,
    conflicted = rows.filter((row) => row.state === 'CONFLICT').length,
    saveState: KeyRemappingSaveState =
      unsupported > 0
        ? 'UNSUPPORTED'
        : conflicted > 0
          ? 'CONFLICT'
          : changed === 0
            ? 'UNCHANGED'
            : 'DIRTY',
    summary =
      saveState === 'UNSUPPORTED'
        ? `${unsupported} ${unsupported === 1 ? 'comandă nu are' : 'comenzi nu au'} o tastă validă. Salvează este blocat până la corectare.`
        : saveState === 'CONFLICT'
          ? `${conflicts.length} ${conflicts.length === 1 ? 'conflict de taste' : 'conflicte de taste'}: ${conflicts
              .map((conflict) => `${conflict.codeLabel} → ${conflict.labels.join(', ')}`)
              .join('; ')}. Salvează este blocat până la corectare.`
          : saveState === 'UNCHANGED'
            ? 'Nicio modificare față de setările salvate.'
            : `${changed} ${changed === 1 ? 'comandă modificată' : 'comenzi modificate'}, niciun conflict. Salvează pentru a păstra.`,
    signature = JSON.stringify([
      KEY_REMAPPING_VERSION,
      current.playerId,
      current.revision,
      saveState,
      rows.map((row) => [
        row.action,
        row.current,
        row.defaultCode,
        row.proposed,
        row.state,
        row.message,
      ]),
      conflicts.map((conflict) => [conflict.code, conflict.actions]),
    ]);
  return Object.freeze({
    version: KEY_REMAPPING_VERSION,
    playerId: current.playerId,
    revision: current.revision,
    rows: Object.freeze(rows),
    conflicts: Object.freeze(conflicts),
    saveState,
    canSave: saveState === 'DIRTY',
    changed,
    critical,
    summary,
    signature,
  });
}
