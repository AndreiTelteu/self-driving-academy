import type { ProfileActivation } from '../fleet';
import type { ProfileStore } from '../profiles';
import {
  createDefaultSettings,
  parseRuntimeSettings,
  type RuntimeSettings,
  type SettingsStore,
} from '../settings';
import {
  parseGameSettingsDraft,
  parseKeyRemappingDraft,
  resetGameSettingsDraft,
  resetBindings,
  type GameSettingsDraft,
  type KeyRemappingDraft,
  type StyleSliderField,
  type StyleSlidersDraft,
  type StyleSlidersProjection,
} from '../ui';
import {
  applyGameSettings,
  readGameSettingsDraft,
  type GameSettingsApplyResult,
} from './game-settings';
import {
  applyKeyRemapping,
  readKeyRemappingDraft,
  type KeyRemappingApplyResult,
} from './key-remapping';
import type { LearningEpochBarrier } from './learning-epoch';
import {
  createStyleSlidersSession,
  type StyleSlidersSession,
  type StyleSlidersTarget,
  type StyleSlidersTickResult,
  type StyleSlidersVersionSummary,
} from './control-sliders-style';
import type { ProfileRestoreResult } from './profile-restore';

/**
 * PBI 279 live settings composition.
 *
 * One surface composes the real 081 device settings, the real 080 key bindings and the real 230
 * style session. Device settings live only in the injected 009 `SettingsStore`; they never touch a
 * `DrivingProfile`, a learned parameter, telemetry or XP. A style application is the only path that
 * changes a profile: it derives one `MANUAL_TUNING` version in the real 109 store and resolves it
 * through the real 205 barrier and 110 activation.
 *
 * The module owns no DOM, no simulation, no second store and no second ledger.
 */
export const LIVE_SETTINGS_VERSION = '279-live-settings-v1' as const;

export type LiveSettingsOpenStatus = 'OPENED' | 'ALREADY_OPEN' | 'PLAYER_MISMATCH';
export type LiveSettingsActionStatus = 'SAVED' | 'REJECTED' | 'NOT_OPEN';

export interface LiveSettingsStylePorts {
  readonly playerId: string;
  readonly profileId: string;
  readonly engineVersion: string;
  readonly store: ProfileStore;
  readonly barrier: LearningEpochBarrier;
  readonly activation: Pick<ProfileActivation, 'pending' | 'applyAt' | 'activeProfile'>;
  readonly readTarget: () => StyleSlidersTarget;
  readonly restore?: (versionId: string, tick: number) => ProfileRestoreResult;
  readonly readInFlightJobs?: () => number;
}

export interface LiveSettingsOptions {
  readonly store: SettingsStore;
  readonly playerId: string;
  readonly tick: () => number;
  /** Absent in Haos: the editor of the Academy profile never edits another session's copy. */
  readonly style?: LiveSettingsStylePorts;
  readonly now?: () => string;
  readonly onSettingsSaved?: (settings: RuntimeSettings) => void;
  readonly onStyleResult?: (result: StyleSlidersTickResult) => void;
}

export interface LiveSettingsState {
  readonly version: typeof LIVE_SETTINGS_VERSION;
  readonly open: boolean;
  readonly settingsDraft: GameSettingsDraft | null;
  readonly keyDraft: KeyRemappingDraft | null;
  readonly styleDraft: StyleSlidersDraft | null;
  readonly styleView: StyleSlidersProjection | null;
  readonly styleAvailable: boolean;
  readonly styleReason: string | null;
  readonly message: string;
  readonly messageCode:
    | 'OPENED'
    | 'CLOSED'
    | 'SAVED'
    | 'REJECTED'
    | 'STYLE_QUEUED'
    | 'STYLE_PUBLISHED'
    | 'PLAYER_MISMATCH'
    | 'DISPOSED';
  readonly disposed: boolean;
}

export interface LiveSettingsStats {
  readonly version: typeof LIVE_SETTINGS_VERSION;
  readonly opens: number;
  readonly closes: number;
  readonly settingsSaves: number;
  readonly keySaves: number;
  readonly settingsRejections: number;
  readonly keyRejections: number;
  readonly styleQueues: number;
  readonly styleWithdrawn: number;
  readonly stylePublished: number;
  readonly styleActivated: number;
  readonly styleRejections: number;
  readonly styleRestores: number;
  readonly retainedDrafts: 1;
  readonly profileTouchedByDeviceSettings: 0;
  readonly xpWrites: 0;
  readonly learningJobs: 0;
  readonly disposed: boolean;
}

export interface LiveSettings {
  readonly version: typeof LIVE_SETTINGS_VERSION;
  open(): LiveSettingsOpenStatus;
  close(): boolean;
  isOpen(): boolean;
  getState(): LiveSettingsState;
  getStats(): LiveSettingsStats;
  getSettingsDraft(): GameSettingsDraft | null;
  getKeyDraft(): KeyRemappingDraft | null;
  getStyleDraft(): StyleSlidersDraft | null;
  adoptSettings(candidate: GameSettingsDraft): GameSettingsDraft;
  saveSettings(candidate?: GameSettingsDraft): GameSettingsApplyResult | { status: 'NOT_OPEN' };
  cancelSettings(): GameSettingsDraft | null;
  proposeSettingsDefaults(): GameSettingsDraft | null;
  adoptKeys(candidate: KeyRemappingDraft): KeyRemappingDraft;
  saveKeys(candidate?: KeyRemappingDraft): KeyRemappingApplyResult | { status: 'NOT_OPEN' };
  cancelKeys(): KeyRemappingDraft | null;
  proposeKeyDefaults(): KeyRemappingDraft | null;
  adoptStyle(candidate: StyleSlidersDraft): StyleSlidersDraft;
  setStyleValue(field: StyleSliderField, value: number): StyleSlidersDraft | null;
  queueStyleApply(candidate?: StyleSlidersDraft): ReturnType<StyleSlidersSession['queueApply']>;
  withdrawStyle(): boolean;
  revertStyle(): StyleSlidersDraft | null;
  rebaseStyle(): StyleSlidersDraft | null;
  refreshStyle(): StyleSlidersProjection | null;
  restoreStyle(versionId: string): ReturnType<StyleSlidersSession['requestRestore']>;
  getStyleVersionSummary(): StyleSlidersVersionSummary | null;
  step(tick: number): StyleSlidersTickResult | null;
  dispose(): void;
}

function requirePlayer(settings: RuntimeSettings, playerId: string): void {
  if (settings.playerId !== playerId) throw new Error('Live settings belong to another player');
}

export function createLiveSettings(options: LiveSettingsOptions): LiveSettings {
  if (!options || typeof options !== 'object') throw new Error('Live settings options');
  const store = options.store;
  if (!store || typeof store.getSnapshot !== 'function' || typeof store.replace !== 'function')
    throw new Error('Live settings requires the real 009 settings store');
  if (typeof options.playerId !== 'string' || options.playerId.trim() === '')
    throw new Error('Live settings requires a current player');
  if (typeof options.tick !== 'function') throw new Error('Live settings requires a tick port');
  if (options.onSettingsSaved !== undefined && typeof options.onSettingsSaved !== 'function')
    throw new Error('Live settings save callback');
  if (options.onStyleResult !== undefined && typeof options.onStyleResult !== 'function')
    throw new Error('Live settings style callback');
  const playerId = options.playerId;
  requirePlayer(store.getSnapshot(), playerId);
  const now = options.now ?? (() => new Date().toISOString());
  const tickNow = () => {
    const value = options.tick();
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Live settings tick');
    return value;
  };

  let settingsSession: StyleSlidersSession | null = null;
  let lastVersionSummary: StyleSlidersVersionSummary | null = null;
  let settingsDraft: GameSettingsDraft | null = null,
    keyDraft: KeyRemappingDraft | null = null,
    styleDraft: StyleSlidersDraft | null = null,
    styleView: StyleSlidersProjection | null = null,
    styleAvailable = options.style !== undefined,
    styleReason: string | null =
      options.style === undefined
        ? 'Editorul de stil este indisponibil în această sesiune; profilul altei sesiuni nu este editat.'
        : null,
    open = false,
    disposed = false,
    message = 'Setările sunt închise.',
    messageCode: LiveSettingsState['messageCode'] = 'CLOSED';
  const counters = {
    opens: 0,
    closes: 0,
    settingsSaves: 0,
    keySaves: 0,
    settingsRejections: 0,
    keyRejections: 0,
    styleQueues: 0,
    styleWithdrawn: 0,
    stylePublished: 0,
    styleActivated: 0,
    styleRejections: 0,
    styleRestores: 0,
  };

  const assertLive = () => {
    if (disposed) throw new Error('Live settings disposed');
  };
  const setMessage = (text: string, code: LiveSettingsState['messageCode']) => {
    message = text;
    messageCode = code;
  };
  const currentSettings = () => {
    const stored = store.getSnapshot();
    requirePlayer(stored, playerId);
    return stored;
  };
  const refreshDeviceDrafts = (settings: RuntimeSettings) => {
    settingsDraft = readGameSettingsDraft(settings, playerId);
    keyDraft = readKeyRemappingDraft(settings, playerId);
  };
  const ensureStyleSession = (): StyleSlidersSession | null => {
    if (options.style === undefined) {
      styleAvailable = false;
      styleReason =
        'Editorul de stil este indisponibil în această sesiune; profilul altei sesiuni nu este editat.';
      return null;
    }
    if (settingsSession === null) {
      const style = options.style;
      settingsSession = createStyleSlidersSession({
        playerId: style.playerId,
        profileId: style.profileId,
        engineVersion: style.engineVersion,
        store: style.store,
        barrier: style.barrier,
        activation: style.activation,
        readTarget: style.readTarget,
        tick: tickNow,
        now,
        operationPrefix: 'settings-279',
        ...(style.restore === undefined ? {} : { restore: style.restore }),
        ...(style.readInFlightJobs === undefined
          ? {}
          : { readInFlightJobs: style.readInFlightJobs }),
      });
    }
    return settingsSession;
  };
  const syncStyle = (session: StyleSlidersSession) => {
    styleDraft = session.getDraft();
    styleView = session.getView();
    styleAvailable = true;
    styleReason = styleDraft === null ? session.getState().message : null;
  };

  return Object.freeze({
    version: LIVE_SETTINGS_VERSION,
    open(): LiveSettingsOpenStatus {
      assertLive();
      if (open) return 'ALREADY_OPEN';
      const stored = store.getSnapshot();
      if (stored.playerId !== playerId) {
        setMessage('Setările aparțin altui jucător.', 'PLAYER_MISMATCH');
        return 'PLAYER_MISMATCH';
      }
      refreshDeviceDrafts(stored);
      const session = ensureStyleSession();
      if (session === null) {
        styleDraft = null;
        styleView = null;
      } else {
        const opened = session.open();
        if (opened === 'OPENED') {
          syncStyle(session);
          styleReason = null;
        } else {
          styleDraft = null;
          styleView = null;
          styleAvailable = false;
          styleReason = session.getState().message;
        }
      }
      open = true;
      counters.opens += 1;
      setMessage(
        'Setările dispozitivului sunt locale până la Salvează. Stilul orașului este o suprafață separată, cu bariera 205 și activarea 110.',
        'OPENED',
      );
      return 'OPENED';
    },
    close(): boolean {
      assertLive();
      if (!open) return false;
      if (settingsSession !== null && settingsSession.isOpen()) settingsSession.close();
      open = false;
      counters.closes += 1;
      settingsDraft = null;
      keyDraft = null;
      styleDraft = null;
      styleView = null;
      setMessage(
        'Setările au fost închise; o aplicare de stil în așteptare se publică la tick.',
        'CLOSED',
      );
      return true;
    },
    isOpen: () => open,
    getState: () =>
      Object.freeze({
        version: LIVE_SETTINGS_VERSION,
        open,
        settingsDraft,
        keyDraft,
        styleDraft,
        styleView,
        styleAvailable,
        styleReason,
        message,
        messageCode,
        disposed,
      }),
    getStats: () =>
      Object.freeze({
        version: LIVE_SETTINGS_VERSION,
        opens: counters.opens,
        closes: counters.closes,
        settingsSaves: counters.settingsSaves,
        keySaves: counters.keySaves,
        settingsRejections: counters.settingsRejections,
        keyRejections: counters.keyRejections,
        styleQueues: counters.styleQueues,
        styleWithdrawn: counters.styleWithdrawn,
        stylePublished: counters.stylePublished,
        styleActivated: counters.styleActivated,
        styleRejections: counters.styleRejections,
        styleRestores: counters.styleRestores,
        retainedDrafts: 1 as const,
        profileTouchedByDeviceSettings: 0 as const,
        xpWrites: 0 as const,
        learningJobs: 0 as const,
        disposed,
      }),
    getSettingsDraft: () => settingsDraft,
    getKeyDraft: () => keyDraft,
    getStyleDraft: () => styleDraft,
    adoptSettings(candidate: GameSettingsDraft): GameSettingsDraft {
      assertLive();
      if (!open || settingsDraft === null) throw new Error('Live settings are closed');
      const parsed = parseGameSettingsDraft(candidate);
      if (parsed.playerId !== playerId)
        throw new Error('Live settings draft belongs to another player');
      settingsDraft = parsed;
      return parsed;
    },
    saveSettings(candidate?: GameSettingsDraft) {
      assertLive();
      if (!open || settingsDraft === null) return { status: 'NOT_OPEN' as const };
      if (candidate !== undefined) {
        const parsed = parseGameSettingsDraft(candidate);
        if (parsed.playerId !== playerId)
          throw new Error('Live settings draft belongs to another player');
        settingsDraft = parsed;
      }
      const active = settingsDraft;
      if (active === null) return { status: 'NOT_OPEN' as const };
      const result = applyGameSettings({ store, settings: currentSettings() }, active);
      if (result.status === 'SAVED') {
        counters.settingsSaves += 1;
        const saved = result.settings;
        refreshDeviceDrafts(saved);
        options.onSettingsSaved?.(saved);
        setMessage(
          `Setările dispozitivului au fost salvate; versiunea de control ${saved.input.control.version}, profilul învățat rămâne neatins.`,
          'SAVED',
        );
      } else {
        counters.settingsRejections += 1;
        setMessage(`Setările au fost refuzate: ${result.reason}.`, 'REJECTED');
      }
      return result;
    },
    cancelSettings(): GameSettingsDraft | null {
      assertLive();
      if (!open) return null;
      settingsDraft = readGameSettingsDraft(currentSettings(), playerId);
      setMessage('Modificările locale de dispozitiv au fost anulate.', 'OPENED');
      return settingsDraft;
    },
    proposeSettingsDefaults(): GameSettingsDraft | null {
      assertLive();
      if (!open || settingsDraft === null) return null;
      settingsDraft = resetGameSettingsDraft(settingsDraft);
      setMessage('Valorile implicite sunt propuse local; Salvează pentru a le păstra.', 'OPENED');
      return settingsDraft;
    },
    adoptKeys(candidate: KeyRemappingDraft): KeyRemappingDraft {
      assertLive();
      if (!open || keyDraft === null) throw new Error('Live settings are closed');
      const parsed = parseKeyRemappingDraft(candidate);
      if (parsed.playerId !== playerId)
        throw new Error('Live settings draft belongs to another player');
      keyDraft = parsed;
      return parsed;
    },
    saveKeys(candidate?: KeyRemappingDraft) {
      assertLive();
      if (!open || keyDraft === null) return { status: 'NOT_OPEN' as const };
      if (candidate !== undefined) {
        const parsed = parseKeyRemappingDraft(candidate);
        if (parsed.playerId !== playerId)
          throw new Error('Live settings draft belongs to another player');
        keyDraft = parsed;
      }
      const active = keyDraft;
      if (active === null) return { status: 'NOT_OPEN' as const };
      const result = applyKeyRemapping({ store, settings: currentSettings() }, active);
      if (result.status === 'SAVED') {
        counters.keySaves += 1;
        const saved = result.settings;
        refreshDeviceDrafts(saved);
        options.onSettingsSaved?.(saved);
        setMessage(
          'Tastele au fost salvate în setările dispozitivului; profilul învățat și XP-ul rămân neschimbate.',
          'SAVED',
        );
      } else {
        counters.keyRejections += 1;
        setMessage(`Tastele au fost refuzate: ${result.reason}.`, 'REJECTED');
      }
      return result;
    },
    cancelKeys(): KeyRemappingDraft | null {
      assertLive();
      if (!open) return null;
      keyDraft = readKeyRemappingDraft(currentSettings(), playerId);
      setMessage('Modificările locale de taste au fost anulate.', 'OPENED');
      return keyDraft;
    },
    proposeKeyDefaults(): KeyRemappingDraft | null {
      assertLive();
      if (!open || keyDraft === null) return null;
      keyDraft = resetBindings(keyDraft);
      setMessage('Tastele implicite sunt propuse local; Salvează pentru a le păstra.', 'OPENED');
      return keyDraft;
    },
    adoptStyle(candidate: StyleSlidersDraft): StyleSlidersDraft {
      assertLive();
      const session = settingsSession;
      if (session === null || !session.isOpen()) throw new Error('Style editor is not open');
      styleDraft = session.adopt(candidate);
      styleView = session.getView();
      return styleDraft;
    },
    setStyleValue(field: StyleSliderField, value: number): StyleSlidersDraft | null {
      assertLive();
      const session = settingsSession;
      if (session === null || !session.isOpen()) return null;
      styleDraft = session.setValue(field, value);
      styleView = session.getView();
      return styleDraft;
    },
    queueStyleApply(candidate?: StyleSlidersDraft) {
      assertLive();
      const session = settingsSession;
      if (session === null || !session.isOpen()) {
        setMessage('Editorul de stil este închis; nimic nu a fost aplicat.', 'REJECTED');
        return 'NOT_OPEN' as const;
      }
      if (candidate !== undefined) {
        styleDraft = session.adopt(candidate);
        styleView = session.getView();
      }
      counters.styleQueues += 1;
      const status = session.queueApply();
      if (status === 'QUEUED') {
        setMessage(
          'Aplicarea de stil este în așteptare; doar diferențele se publică la următorul tick prin bariera 205 și activarea 110.',
          'STYLE_QUEUED',
        );
      } else if (status === 'INVALID' || status === 'STALE_BASE' || status === 'SESSION_CHANGED') {
        counters.styleRejections += 1;
        setMessage(session.getState().message, 'REJECTED');
      } else {
        setMessage(session.getState().message, 'OPENED');
      }
      return status;
    },
    withdrawStyle(): boolean {
      assertLive();
      const session = settingsSession;
      if (session === null) return false;
      const withdrawn = session.withdraw();
      if (withdrawn) {
        counters.styleWithdrawn += 1;
        setMessage(
          'Aplicarea de stil în așteptare a fost retrasă; nimic nu a fost scris.',
          'OPENED',
        );
      }
      return withdrawn;
    },
    revertStyle(): StyleSlidersDraft | null {
      assertLive();
      const session = settingsSession;
      if (session === null) return null;
      styleDraft = session.revert();
      styleView = session.getView();
      return styleDraft;
    },
    rebaseStyle(): StyleSlidersDraft | null {
      assertLive();
      const session = settingsSession;
      if (session === null) return null;
      styleDraft = session.rebase();
      styleView = session.getView();
      return styleDraft;
    },
    refreshStyle(): StyleSlidersProjection | null {
      assertLive();
      const session = settingsSession;
      if (session === null) return null;
      styleView = session.refresh();
      styleDraft = session.getDraft();
      return styleView;
    },
    restoreStyle(versionId: string) {
      assertLive();
      const session = settingsSession;
      if (session === null) return 'NOT_OPEN' as const;
      counters.styleRestores += 1;
      const status = session.requestRestore(versionId);
      setMessage(session.getState().message, status === 'QUEUED' ? 'OPENED' : 'REJECTED');
      return status;
    },
    getStyleVersionSummary: () => lastVersionSummary,
    step(tick: number): StyleSlidersTickResult | null {
      assertLive();
      const session = settingsSession;
      if (session === null) return null;
      session.observeTick(tick);
      const result = session.applyAtTick(tick);
      if (result.status === 'PUBLISHED') {
        counters.stylePublished += 1;
        lastVersionSummary = result.versionSummary;
        styleDraft = null;
        styleView = null;
        styleAvailable = false;
        styleReason = `Versiunea ${result.versionId ?? '—'} a fost publicată MANUAL_TUNING; editorul se redeschide pe noua bază.`;
        setMessage(result.message, 'STYLE_PUBLISHED');
      } else if (result.status === 'ACTIVATED') {
        counters.styleActivated += 1;
        setMessage(result.message, 'STYLE_PUBLISHED');
      } else if (result.status === 'REJECTED' || result.status === 'STALE_BASE') {
        counters.styleRejections += 1;
        setMessage(result.message, 'REJECTED');
      } else if (result.status === 'RESTORED') {
        counters.styleRestores += 1;
        setMessage(result.message, 'STYLE_PUBLISHED');
      }
      if (result.status !== 'IDLE' && result.status !== 'NOT_DUE' && result.status !== 'PENDING')
        options.onStyleResult?.(result);
      return result;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      open = false;
      settingsSession?.dispose();
      settingsSession = null;
      settingsDraft = null;
      keyDraft = null;
      styleDraft = null;
      styleView = null;
      lastVersionSummary = null;
      setMessage('Setările au fost eliberate.', 'DISPOSED');
    },
  });
}

/** The real 009 defaults used by the report and by an explicit reset proposal. */
export function liveSettingsDefaults(playerId: string): RuntimeSettings {
  return createDefaultSettings(playerId);
}

/** A complete settings record is the only accepted persistence shape. */
export function liveSettingsCanonical(settings: RuntimeSettings): RuntimeSettings {
  return parseRuntimeSettings(settings);
}

export type { StyleSlidersTickResult };
