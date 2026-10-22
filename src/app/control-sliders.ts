import {
  applyControlSliderPreset,
  createControlSlidersDraft,
  controlSlidersRuntimeCandidate,
  parseControlSlidersDraft,
  projectControlSliders,
  resetControlSlidersDraft,
  revertControlSlidersDraft,
  setControlSliderValue,
  CONTROL_SLIDER_FIELDS,
  type ControlSliderField,
  type ControlSliderPreset,
  type ControlSlidersDraft,
  type ControlSlidersProjection,
} from '../ui';
import {
  createDefaultSettings,
  getControlPreferencesVersion,
  parseRuntimeSettings,
  type ControlPreferences,
  type RuntimeSettings,
  type SettingsStore,
} from '../settings';
import type { InterventionTarget, InterventionTargetChange } from '../telemetry';
import type { PauseFocusOwner } from './pause-focus';

/**
 * 229 popup session.
 *
 * The session opens the modal as a 070 *menu* surface, so every mode (AUTO, MANUAL, LEARNING) is
 * suspended while it is open, and it asks 025 to release the held driving commands once. The draft
 * is local: a slider move never writes the store. `applyAtTick` is the only writer and is called by
 * the host immediately before the next physical tick; it persists the new control revision once,
 * hands the new preferences to the 025 filter for that tick and returns the 069
 * `CONTROL_PREFERENCES_CHANGE` target change, so the open telemetry segment is closed and a new one
 * is opened with the new `controlPreferencesVersion`.
 *
 * It never imports `src/profiles`, `src/fleet` or an autonomy module, never reads or writes a learned
 * parameter or a fleet style and never changes a vehicle class, mass, power, brake or grip.
 */
export const CONTROL_SLIDERS_SESSION_VERSION = '229-control-sliders-session-v1' as const;

export type ControlSlidersOpenStatus = 'OPENED' | 'ALREADY_OPEN' | 'PLAYER_MISMATCH';

export type ControlSlidersApplyStatus =
  'QUEUED' | 'UNCHANGED' | 'INVALID' | 'NOT_OPEN' | 'STALE_SETTINGS';

export type ControlSlidersTickStatus =
  'IDLE' | 'APPLIED' | 'NOT_DUE' | 'NOT_OPEN' | 'STALE_SETTINGS' | 'PLAYER_MISMATCH' | 'INVALID';

export interface ControlSlidersTickResult {
  readonly status: ControlSlidersTickStatus;
  readonly tick: number;
  /** The exact object the host must pass to `bridge.step`; `null` when nothing applies. */
  readonly change: InterventionTargetChange | null;
  readonly settings: RuntimeSettings | null;
}

export interface ControlSlidersSessionOptions {
  readonly store: SettingsStore;
  /** The 009 record read at the same moment as `store`; revalidated on every apply. */
  readonly readSettings: () => RuntimeSettings;
  /** The single 070 owner of the session; the popup opens a `menu` surface. */
  readonly pauseFocus: PauseFocusOwner;
  /** 025/027 held-command release; called once when the popup opens. */
  readonly resetHeldCommands: () => void;
  /** The 069 target currently frozen into the telemetry segment. */
  readonly readTarget: () => InterventionTarget;
  /** 025 filter: apply the new preferences at the tick that is being prepared. */
  readonly applyInputPreferences?: (control: ControlPreferences, atTick: number) => void;
  /** Deterministic operation id prefix; the tick is appended. */
  readonly operationPrefix?: string;
  readonly now?: () => number;
}

export interface ControlSlidersSessionState {
  readonly version: typeof CONTROL_SLIDERS_SESSION_VERSION;
  readonly open: boolean;
  readonly pendingApply: boolean;
  readonly draft: ControlSlidersDraft | null;
  readonly view: ControlSlidersProjection | null;
  readonly message: string;
  readonly messageCode: ControlSlidersApplyStatus | ControlSlidersTickStatus | 'CLOSED';
  readonly disposed: boolean;
}

export interface ControlSlidersSessionStats {
  readonly version: typeof CONTROL_SLIDERS_SESSION_VERSION;
  readonly opens: number;
  readonly closes: number;
  readonly queueRequests: number;
  readonly applied: number;
  readonly withdrawn: number;
  readonly unchanged: number;
  readonly invalid: number;
  readonly stale: number;
  readonly notDue: number;
  readonly releasedInputs: number;
  readonly surfaceCalls: number;
  readonly changesDrivingProfile: false;
  readonly changesVehicleMechanics: false;
  readonly changesLearnedAi: false;
  readonly lastAppliedTick: number | null;
  readonly lastOperationId: string | null;
  readonly pendingApply: boolean;
  readonly disposed: boolean;
}

export interface ControlSlidersSession {
  readonly version: typeof CONTROL_SLIDERS_SESSION_VERSION;
  open(): ControlSlidersOpenStatus;
  close(): boolean;
  isOpen(): boolean;
  getDraft(): ControlSlidersDraft | null;
  getView(): ControlSlidersProjection | null;
  queueApply(): ControlSlidersApplyStatus;
  /** Adopts the panel's validated draft; it must belong to the open player. */
  adopt(candidate: ControlSlidersDraft): ControlSlidersDraft;
  /** Programmatic single-slider change, used by hosts/tests that do not own a DOM panel. */
  setValue(field: ControlSliderField, value: number): ControlSlidersDraft | null;
  /** Programmatic preset, kept for parity with the panel's preset buttons. */
  applyPreset(preset: ControlSliderPreset): ControlSlidersDraft | null;
  /** Clears a queued application without touching the store; used by „Anulează”. */
  withdraw(): boolean;
  /** Reverts the local draft to the persisted preferences. */
  revert(): ControlSlidersDraft | null;
  /** Proposes the real 009 defaults locally; nothing is written. */
  proposeDefaults(): ControlSlidersDraft | null;
  /** Called by the host every tick, even when nothing is queued. */
  observeTick(tick: number): void;
  /** Called before the physical tick: the only place that persists and publishes a change. */
  applyAtTick(tick: number): ControlSlidersTickResult;
  /** 069 `preparedTarget` port for the object returned by `applyAtTick`. */
  preparedTarget(operationId: string): InterventionTargetChange | null;
  getState(): ControlSlidersSessionState;
  getStats(): ControlSlidersSessionStats;
  dispose(): void;
}

const MAX_TARGET_ID = 256;

function requireTick(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error(`Control sliders ${label}`);
  return value;
}

function requireTarget(value: unknown): InterventionTarget {
  if (!value || typeof value !== 'object') throw new Error('Control sliders target');
  const target = value as InterventionTarget;
  for (const key of [
    'sessionId',
    'playerId',
    'profileId',
    'baseVersionId',
    'controlPreferencesVersion',
    'engineVersion',
    'mapVersion',
  ] as const) {
    if (
      typeof target[key] !== 'string' ||
      target[key].length === 0 ||
      target[key].length > MAX_TARGET_ID
    )
      throw new Error(`Control sliders target ${key}`);
  }
  requireTick(target.worldEpoch, 'target worldEpoch');
  requireTick(target.learningEpoch, 'target learningEpoch');
  if (target.version !== '069-intervention-target-v1')
    throw new Error('Control sliders target version');
  if (target.schemaVersion !== 1 || target.units !== 'SI')
    throw new Error('Control sliders target context');
  if (target.inputType !== 'KEYBOARD' && target.inputType !== 'GAMEPAD')
    throw new Error('Control sliders target input type');
  return target;
}

function sameSettings(left: RuntimeSettings, right: RuntimeSettings): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function defaultsFor(settings: RuntimeSettings): Readonly<ControlPreferences> {
  const defaults = createDefaultSettings(settings.playerId).input.control;
  return Object.freeze({
    ...defaults,
    version: settings.input.control.version,
    mappingVersion: settings.input.control.mappingVersion,
  });
}

export function createControlSlidersSession(
  options: ControlSlidersSessionOptions,
): ControlSlidersSession {
  if (!options || typeof options !== 'object') throw new Error('Control sliders session options');
  const store = options.store;
  if (!store || typeof store.replace !== 'function' || typeof store.getSnapshot !== 'function')
    throw new Error('Control sliders requires the real 009 settings store');
  const pauseFocus = options.pauseFocus;
  if (!pauseFocus || typeof pauseFocus.setSurface !== 'function')
    throw new Error('Control sliders requires the 070 pause/focus owner');
  for (const port of ['readSettings', 'resetHeldCommands', 'readTarget'] as const)
    if (typeof options[port] !== 'function')
      throw new Error(`Control sliders requires the ${port} port`);
  if (
    options.applyInputPreferences !== undefined &&
    typeof options.applyInputPreferences !== 'function'
  )
    throw new Error('Control sliders input preferences port');
  const clock = options.now ?? (() => performance.now());
  if (typeof clock !== 'function') throw new Error('Control sliders clock');
  const prefix = options.operationPrefix ?? 'control-preferences';
  if (typeof prefix !== 'string' || prefix.length === 0 || prefix.length > 120)
    throw new Error('Control sliders operation prefix');

  let draft: ControlSlidersDraft | null = null,
    view: ControlSlidersProjection | null = null,
    open = false,
    disposed = false,
    pending: {
      readonly draft: ControlSlidersDraft;
      readonly settingsAtQueue: RuntimeSettings;
      readonly queuedAtTick: number;
    } | null = null,
    prepared: InterventionTargetChange | null = null,
    lastSeenTick = -1,
    message = 'Popup închis.',
    messageCode: ControlSlidersSessionState['messageCode'] = 'CLOSED',
    opens = 0,
    closes = 0,
    queueRequests = 0,
    applied = 0,
    withdrawn = 0,
    unchanged = 0,
    invalid = 0,
    stale = 0,
    notDue = 0,
    releasedInputs = 0,
    surfaceCalls = 0,
    lastAppliedTick: number | null = null,
    lastOperationId: string | null = null;

  const assertLive = () => {
    if (disposed) throw new Error('Control sliders session disposed');
  };
  const setMessage = (text: string, code: ControlSlidersSessionState['messageCode']) => {
    message = text;
    messageCode = code;
  };
  const clockNow = () => {
    const value = clock();
    if (!Number.isFinite(value)) throw new Error('Control sliders clock');
    return value;
  };

  return Object.freeze({
    version: CONTROL_SLIDERS_SESSION_VERSION,
    open(): ControlSlidersOpenStatus {
      assertLive();
      if (open) return 'ALREADY_OPEN';
      const settings = options.readSettings(),
        stored = store.getSnapshot();
      if (settings.playerId !== stored.playerId) {
        setMessage('Reglajele aparțin altui jucător; popup-ul nu s-a deschis.', 'PLAYER_MISMATCH');
        return 'PLAYER_MISMATCH';
      }
      draft = createControlSlidersDraft({
        playerId: settings.playerId,
        saved: settings.input.control,
        defaults: defaultsFor(settings),
      });
      view = projectControlSliders(draft);
      open = true;
      opens += 1;
      surfaceCalls += 1;
      pauseFocus.setSurface('menu', true);
      options.resetHeldCommands();
      releasedInputs += 1;
      setMessage(
        'Simularea este pe pauză în toate modurile. Reglajele se editează local; Aplică scrie o versiune nouă la următorul tick.',
        'QUEUED',
      );
      clockNow();
      return 'OPENED';
    },
    close(): boolean {
      assertLive();
      if (!open) return false;
      open = false;
      closes += 1;
      draft = null;
      view = null;
      // A queued application survives closing: „Aplică” is the commitment and the popup must be able
      // to close (and resume the world) before the next tick publishes the change. Only „Anulează”
      // (`withdraw`) drops it.
      surfaceCalls += 1;
      pauseFocus.setSurface('menu', false);
      setMessage(
        pending === null
          ? 'Popup închis; comenzile ținute au fost eliberate.'
          : 'Popup închis; aplicarea în așteptare se publică la următorul tick.',
        'CLOSED',
      );
      return true;
    },
    isOpen: () => open,
    getDraft: () => draft,
    getView: () => view,
    queueApply(): ControlSlidersApplyStatus {
      assertLive();
      queueRequests += 1;
      if (!open || draft === null) {
        setMessage('Popup-ul este închis; nu există nimic de aplicat.', 'NOT_OPEN');
        return 'NOT_OPEN';
      }
      const projected = projectControlSliders(draft);
      view = projected;
      if (projected.issues.length > 0) {
        invalid += 1;
        setMessage('Valorile din afara limitelor nu pot fi aplicate.', 'INVALID');
        return 'INVALID';
      }
      if (projected.changedCount === 0) {
        unchanged += 1;
        setMessage(
          'Nicio modificare față de reglajele salvate; nu s-a aplicat nimic.',
          'UNCHANGED',
        );
        return 'UNCHANGED';
      }
      const settings = options.readSettings(),
        stored = store.getSnapshot();
      if (
        settings.playerId !== draft.playerId ||
        stored.playerId !== draft.playerId ||
        !sameSettings(stored, settings)
      ) {
        stale += 1;
        setMessage(
          'Setările salvate s-au schimbat între timp; redeschide popup-ul înainte de aplicare.',
          'STALE_SETTINGS',
        );
        return 'STALE_SETTINGS';
      }
      pending = {
        draft: parseControlSlidersDraft(draft),
        settingsAtQueue: settings,
        queuedAtTick: lastSeenTick,
      };
      setMessage(
        'Aplicarea este în așteptare: se face o singură dată, la următorul tick, cu o versiune nouă de control.',
        'QUEUED',
      );
      clockNow();
      return 'QUEUED';
    },
    withdraw(): boolean {
      assertLive();
      if (pending === null) return false;
      pending = null;
      prepared = null;
      withdrawn += 1;
      setMessage('Aplicarea în așteptare a fost retrasă; nimic nu a fost scris.', 'CLOSED');
      return true;
    },
    adopt(candidate: ControlSlidersDraft): ControlSlidersDraft {
      assertLive();
      if (!open || draft === null) throw new Error('Control sliders popup is closed');
      const parsed = parseControlSlidersDraft(candidate);
      if (parsed.playerId !== draft.playerId)
        throw new Error('Control sliders draft belongs to another player');
      draft = parsed;
      view = projectControlSliders(draft);
      return draft;
    },
    setValue(field: ControlSliderField, value: number): ControlSlidersDraft | null {
      assertLive();
      if (!open || draft === null) return null;
      draft = setControlSliderValue(draft, field, value);
      view = projectControlSliders(draft);
      return draft;
    },
    applyPreset(preset: ControlSliderPreset): ControlSlidersDraft | null {
      assertLive();
      if (!open || draft === null) return null;
      draft = applyControlSliderPreset(draft, preset);
      view = projectControlSliders(draft);
      return draft;
    },
    revert(): ControlSlidersDraft | null {
      assertLive();
      if (draft === null) return null;
      draft = revertControlSlidersDraft(draft);
      view = projectControlSliders(draft);
      return draft;
    },
    proposeDefaults(): ControlSlidersDraft | null {
      assertLive();
      if (draft === null) return null;
      draft = resetControlSlidersDraft(draft);
      view = projectControlSliders(draft);
      return draft;
    },
    observeTick(tick: number): void {
      assertLive();
      const at = requireTick(tick, 'tick');
      if (at > lastSeenTick) lastSeenTick = at;
    },
    applyAtTick(tick: number): ControlSlidersTickResult {
      assertLive();
      const at = requireTick(tick, 'apply tick');
      if (pending === null) {
        if (at > lastSeenTick) lastSeenTick = at;
        return { status: 'IDLE', tick: at, change: null, settings: null };
      }
      // A change is always published at a tick strictly after the request: never inside the
      // current one, and never twice for the same boundary.
      if (at <= pending.queuedAtTick) {
        notDue += 1;
        if (at > lastSeenTick) lastSeenTick = at;
        return { status: 'NOT_DUE', tick: at, change: null, settings: null };
      }
      if (at > lastSeenTick) lastSeenTick = at;
      const settings = options.readSettings(),
        stored = store.getSnapshot();
      if (!sameSettings(stored, pending.settingsAtQueue) || !sameSettings(settings, stored)) {
        stale += 1;
        pending = null;
        prepared = null;
        setMessage(
          'Setările s-au schimbat înainte de tick; aplicarea a fost refuzată fără suprascriere.',
          'STALE_SETTINGS',
        );
        return { status: 'STALE_SETTINGS', tick: at, change: null, settings: null };
      }
      const target = options.readTarget();
      try {
        requireTarget(target);
      } catch {
        invalid += 1;
        pending = null;
        prepared = null;
        setMessage('Ținta de telemetrie nu este validă; aplicarea a fost refuzată.', 'INVALID');
        return { status: 'INVALID', tick: at, change: null, settings: null };
      }
      if (target.playerId !== pending.draft.playerId) {
        invalid += 1;
        pending = null;
        prepared = null;
        setMessage('Jucătorul țintei de telemetrie nu corespunde setărilor.', 'PLAYER_MISMATCH');
        return { status: 'PLAYER_MISMATCH', tick: at, change: null, settings: null };
      }
      const nextVersion = pending.settingsAtQueue.input.control.version + 1;
      if (!Number.isSafeInteger(nextVersion)) {
        invalid += 1;
        pending = null;
        prepared = null;
        setMessage('Revizia de control este epuizată; aplicarea a fost refuzată.', 'INVALID');
        return { status: 'INVALID', tick: at, change: null, settings: null };
      }
      let saved: RuntimeSettings;
      try {
        saved = store.replace(
          parseRuntimeSettings(
            controlSlidersRuntimeCandidate(pending.draft, pending.settingsAtQueue, nextVersion),
          ),
        );
      } catch {
        invalid += 1;
        pending = null;
        prepared = null;
        setMessage(
          'Setările nu au putut fi salvate; regulile 009 au refuzat candidatul.',
          'INVALID',
        );
        return { status: 'INVALID', tick: at, change: null, settings: null };
      }
      const controlPreferencesVersion = getControlPreferencesVersion(saved),
        operationId = `${prefix}-${at}`,
        change: InterventionTargetChange = Object.freeze({
          schemaVersion: target.schemaVersion,
          units: target.units,
          sessionId: target.sessionId,
          worldEpoch: target.worldEpoch,
          version: '069-validated-target-change-v1',
          operationId,
          tick: at,
          reason: 'CONTROL_PREFERENCES_CHANGE',
          target: Object.freeze({ ...target, controlPreferencesVersion }),
        });
      options.applyInputPreferences?.(saved.input.control, at);
      pending = null;
      prepared = change;
      applied += 1;
      lastAppliedTick = at;
      lastOperationId = operationId;
      if (open) {
        draft = createControlSlidersDraft({
          playerId: saved.playerId,
          saved: saved.input.control,
          defaults: defaultsFor(saved),
        });
        view = projectControlSliders(draft);
      }
      setMessage(
        `Aplicat la tick ${at}: versiunea de control ${saved.input.control.version}; segmentul de telemetrie se închide și se redeschide cu versiunea nouă.`,
        'APPLIED',
      );
      return { status: 'APPLIED', tick: at, change, settings: saved };
    },
    preparedTarget(operationId: string): InterventionTargetChange | null {
      assertLive();
      if (typeof operationId !== 'string' || operationId.length === 0) return null;
      return prepared !== null && prepared.operationId === operationId ? prepared : null;
    },
    getState: () =>
      Object.freeze({
        version: CONTROL_SLIDERS_SESSION_VERSION,
        open,
        pendingApply: pending !== null,
        draft,
        view,
        message,
        messageCode,
        disposed,
      }),
    getStats: () =>
      Object.freeze({
        version: CONTROL_SLIDERS_SESSION_VERSION,
        opens,
        closes,
        queueRequests,
        applied,
        withdrawn,
        unchanged,
        invalid,
        stale,
        notDue,
        releasedInputs,
        surfaceCalls,
        changesDrivingProfile: false as const,
        changesVehicleMechanics: false as const,
        changesLearnedAi: false as const,
        lastAppliedTick,
        lastOperationId,
        pendingApply: pending !== null,
        disposed,
      }),
    dispose() {
      if (disposed) return;
      if (open) {
        open = false;
        surfaceCalls += 1;
        pauseFocus.setSurface('menu', false);
      }
      pending = null;
      prepared = null;
      draft = null;
      view = null;
      disposed = true;
      setMessage('Popup eliberat.', 'CLOSED');
    },
  });
}

/** The seven fields the popup edits are exactly the 009 control fields; no extra key is invented. */
export const CONTROL_SLIDERS_EDITABLE_FIELDS = Object.freeze([...CONTROL_SLIDER_FIELDS]);
