import {
  createStyleSlidersSession,
  type StyleSlidersSession,
  type StyleSlidersTarget,
  type StyleSlidersTickResult,
} from '../../../src/app/control-sliders-style';
import {
  createLearningEpochBarrier,
  type LearningEpochBarrier,
  type LearningEpochSegmentPort,
} from '../../../src/app/learning-epoch';
import { restoreVersion, type ProfileRestoreServices } from '../../../src/app/profile-restore';
import {
  DEFAULT_FLEET_COUNTS,
  createFleetRegistry,
  createProfileActivation,
  createProfileActivationSource,
} from '../../../src/fleet';
import type { FleetRegistry, ProfileActivation } from '../../../src/fleet';
import { createCandidateProfileStore } from '../../../src/learning';
import { getParameterDefinition } from '../../../src/profiles';
import type { ProfileStore } from '../../../src/profiles';
import {
  createControlSlidersDraft,
  createControlSlidersPanel,
  projectControlSliders,
  STYLE_SLIDER_DEFINITIONS,
  STYLE_SLIDER_FIELDS,
  type ControlSlidersDraft,
  type ControlSlidersPanel,
  type StyleSliderField,
} from '../../../src/ui';
import { createDefaultSettings } from '../../../src/settings';

/**
 * 230 visual playtest page.
 *
 * Real popup, real 230 style session, real 109 store with the 102 validator, real 205 barrier and
 * real 110 activation over a real 057 fleet registry. Three host adapters are local to this static
 * page and are not production contracts:
 *   1. `localStorage` mirrors the immutable version list so a reload proves persistence;
 *   2. the 069 segment port and the 103 `cancel` port are in-memory because the page has no
 *      renderer/physics/worker (the real queue is exercised by the Node tests and the report);
 *   3. the tick loop is frozen while the popup is open, which is how the 070 menu surface pauses
 *      the world.
 */

const PLAYER = 'playtest-230',
  PROFILE = 'playtest-profile',
  ENGINE = 'playtest-engine',
  SESSION = 'playtest-academia',
  BASE = 'style-v1',
  STORAGE_KEY = 'sda-230-playtest';

const status = document.getElementById('playtest-status') as HTMLParagraphElement,
  openButton = document.getElementById('playtest-open') as HTMLButtonElement,
  logView = document.getElementById('playtest-log') as HTMLPreElement,
  host = document.getElementById('playtest-host') as HTMLDivElement;

interface SavedValue {
  readonly key: string;
  readonly unit: string;
  readonly value: number;
}
interface SavedVersion {
  readonly versionId: string;
  readonly parentVersionId: string | null;
  readonly values: readonly SavedValue[];
  readonly reason: string;
  readonly createdAt: string;
}
interface SavedState {
  versions: SavedVersion[];
  head: string;
  learningEpoch: number;
}

function defaultValues(): readonly SavedValue[] {
  return STYLE_SLIDER_FIELDS.map((field) => {
    const definition = STYLE_SLIDER_DEFINITIONS[field],
      catalog = getParameterDefinition(definition.parameterKey);
    return Object.freeze({
      key: definition.parameterKey,
      unit: definition.unit,
      value: catalog.default,
    });
  });
}

function baseState(): SavedState {
  return {
    versions: [
      {
        versionId: BASE,
        parentVersionId: null,
        values: defaultValues(),
        reason: 'BASE',
        createdAt: '2026-10-22T00:00:00Z',
      },
    ],
    head: BASE,
    learningEpoch: 1,
  };
}

function readSaved(): SavedState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return baseState();
  try {
    const parsed = JSON.parse(raw) as SavedState;
    if (!Array.isArray(parsed.versions) || typeof parsed.head !== 'string') return baseState();
    return parsed;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return baseState();
  }
}

const saved = readSaved(),
  store: ProfileStore = createCandidateProfileStore({
    engineVersion: ENGINE,
    now: () => new Date().toISOString(),
  });

function materialize(): void {
  for (const version of saved.versions) {
    if (version.parentVersionId === null) {
      store.createBase({
        profileId: PROFILE,
        versionId: version.versionId,
        parameters: Object.fromEntries(version.values.map((entry) => [entry.key, entry.value])),
        createdAt: version.createdAt,
      });
      continue;
    }
    const derived = store.derive({
      profileId: PROFILE,
      versionId: version.versionId,
      parentVersionId: version.parentVersionId,
      segmentId: `manual:${version.versionId}`,
      interventionId: `manual:${version.versionId}`,
      reason: version.reason,
      createdAt: version.createdAt,
      delta: {
        profileVersionId: version.versionId,
        parentVersionId: version.parentVersionId,
        engineVersion: ENGINE,
        schemaVersion: 1,
        units: 'SI',
        values: version.values.map((entry) => ({ ...entry })),
      },
    });
    if (derived.status !== 'ACCEPTED')
      log(`Reload: versiunea ${version.versionId} a fost refuzată (${derived.rejection.code}).`);
  }
}
materialize();

const tick = { value: 0 };
const physical = { x: 12, speed: 9.5, heading: 0.25 };
const segments = { id: `${PROFILE}:g${saved.learningEpoch}`, open: true };
const trackedJobs = new Set<string>();
const segmentPort: LearningEpochSegmentPort = {
  physical: () => JSON.stringify([physical.x, physical.speed, physical.heading]),
  close(request) {
    segments.open = false;
    return Object.freeze({
      segmentId: request.segmentId,
      status: 'CLOSED' as const,
      reason: request.reason,
      tick: request.tick,
    });
  },
  open(request) {
    segments.id = request.segmentId;
    segments.open = true;
    return Object.freeze({
      segmentId: request.segmentId,
      status: 'OPEN' as const,
      tick: request.tick,
    });
  },
};
const configuration = {
  schemaVersion: 1,
  units: 'SI',
  sessionId: SESSION,
  worldEpoch: 1,
  scenarioId: 'playtest-230',
  seed: 230,
  namespace: 'city:playtest:230',
  taxiCount: DEFAULT_FLEET_COUNTS.taxis,
  civilianCount: DEFAULT_FLEET_COUNTS.civilians,
  profile: { profileId: PROFILE, versionId: saved.head },
};
const source = createProfileActivationSource({ profileId: PROFILE, versionId: saved.head });
const registry: FleetRegistry = createFleetRegistry(configuration, { profileSource: source });
const activation: ProfileActivation = createProfileActivation({
  registry,
  source,
  engineVersion: ENGINE,
  clock: () => tick.value,
  now: () => new Date().toISOString(),
});
const barrier: LearningEpochBarrier = createLearningEpochBarrier({
  playerId: PLAYER,
  profileId: PROFILE,
  engineVersion: ENGINE,
  learningEpoch: saved.learningEpoch,
  baseVersionId: saved.head,
  segmentId: segments.id,
  openedTick: tick.value,
  queue: {
    cancel: (segmentId: string) => trackedJobs.delete(segmentId),
  },
  store,
  activation,
  segments: segmentPort,
  tick: () => tick.value,
});

const target = { sessionId: SESSION, worldEpoch: 1 };
const restoreServices: ProfileRestoreServices = {
  playerId: PLAYER,
  profileId: PROFILE,
  engineVersion: ENGINE,
  store,
  barrier,
  activation,
  tick: () => tick.value,
  now: () => new Date().toISOString(),
};
const session: StyleSlidersSession = createStyleSlidersSession({
  playerId: PLAYER,
  profileId: PROFILE,
  engineVersion: ENGINE,
  store,
  barrier,
  activation,
  readTarget: (): StyleSlidersTarget => ({
    sessionId: target.sessionId,
    worldEpoch: target.worldEpoch,
    playerId: PLAYER,
    profileId: PROFILE,
    baseVersionId: barrier.current().baseVersionId,
    learningEpoch: barrier.current().learningEpoch,
  }),
  tick: () => tick.value,
  restore: (versionId, atTick) =>
    restoreVersion(restoreServices, { profileId: PROFILE, versionId, tick: atTick }),
  now: () => new Date().toISOString(),
  operationPrefix: 'manual',
  readInFlightJobs: () => trackedJobs.size,
});

const publishLog: string[] = [];
function log(line: string): void {
  publishLog.push(line);
  logView.textContent = publishLog.join('\n');
}

function persist(): void {
  const state: SavedState = {
    versions: saved.versions,
    head: barrier.current().baseVersionId,
    learningEpoch: barrier.current().learningEpoch,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function fleetVersions(): readonly string[] {
  return [
    ...new Set(
      registry.list().map((vehicle) => registry.state(vehicle.vehicleId)!.appliedProfileVersion),
    ),
  ].sort();
}

function recordPublished(result: StyleSlidersTickResult): void {
  if (result.versionId === null) return;
  const version = store.getVersion(result.versionId);
  if (version === null) return;
  if (saved.versions.some((entry) => entry.versionId === version.versionId)) return;
  const delta = version.provenance.delta;
  saved.versions = [
    ...saved.versions,
    {
      versionId: version.versionId,
      parentVersionId: version.parentVersionId,
      values: (delta?.changes ?? []).map((change) => ({
        key: change.key,
        unit: change.unit,
        value: change.newValue,
      })),
      reason: delta?.reason ?? 'MANUAL_TUNING',
      createdAt: version.createdAt,
    },
  ];
  persist();
  log(
    `publicat ${version.versionId} · ${result.changes.map((change) => `${change.parameterKey} ${change.beforeText}→${change.afterText}`).join(', ')} · epoch ${result.learningEpoch} · activare ${String(result.activation?.activateAtTick)}`,
  );
}

let suspended = false,
  panel: ControlSlidersPanel | null = null;

function settingsDraft(): ControlSlidersDraft {
  const settings = createDefaultSettings(PLAYER, 3);
  return createControlSlidersDraft({
    playerId: settings.playerId,
    saved: settings.input.control,
    defaults: { ...settings.input.control },
  });
}

function ensurePanel(): ControlSlidersPanel {
  if (panel !== null) return panel;
  const styleDraft = session.getDraft();
  if (styleDraft === null) throw new Error('Style draft is missing');
  panel = createControlSlidersPanel(host, settingsDraft(), {
    close: () => {
      session.close();
      suspended = false;
      host.hidden = true;
      render();
    },
    style: {
      draft: styleDraft,
      onChange: (next) => {
        session.adopt(next);
        render();
      },
      apply: (next) => {
        session.adopt(next);
        const queued = session.queueApply();
        if (queued !== 'QUEUED') log(`aplicare ${queued}: ${session.getState().message}`);
        render();
      },
      cancel: (next) => {
        session.adopt(next);
        session.withdraw();
        render();
      },
      reset: (next) => {
        session.adopt(next);
        render();
      },
      rebase: () => {
        const next = session.rebase();
        if (next !== null) panel?.setStyleDraft(next);
        render();
      },
      restore: (versionId) => {
        const requested = session.requestRestore(versionId);
        log(`restaurare ${versionId}: ${requested}`);
        render();
      },
    },
  });
  return panel;
}

function openPanel(tab: 'CONTROL' | 'CITY'): void {
  const opened = session.open();
  if (opened !== 'OPENED') {
    render();
    return;
  }
  suspended = true;
  host.hidden = false;
  const mounted = ensurePanel();
  mounted.setStyleDraft(session.getDraft()!);
  mounted.openPanel();
  if (tab === 'CITY') {
    const cityTab = host.querySelector<HTMLButtonElement>('[id$="tab-city"]');
    cityTab?.click();
  }
  render();
}

function render(): void {
  const state = session.getState();
  status.textContent = `tick ${tick.value} · ${suspended ? 'PAUZĂ' : 'rulează'} · popup ${state.open ? 'deschis' : 'închis'} · head ${barrier.current().baseVersionId} · epoch ${barrier.current().learningEpoch} · flotă ${fleetVersions().join(',')} · ${state.message}`;
}

function tickLoop(): void {
  if (suspended) return;
  tick.value += 1;
  session.observeTick(tick.value);
  const result = session.applyAtTick(tick.value);
  if (result.status === 'PUBLISHED') recordPublished(result);
  if (result.status === 'RESTORED') {
    persist();
    log(`restaurat ${String(result.versionId)} · epoch ${String(result.learningEpoch)}`);
  }
  if (result.status === 'ACTIVATED')
    log(`flotă activă ${fleetVersions().join(',')} la tick ${tick.value}`);
  if (result.status === 'REJECTED') log(`refuzat: ${result.message}`);
  render();
}

openButton.addEventListener('click', () => openPanel('CITY'));
setInterval(tickLoop, 16);
render();

interface PlaytestApi {
  readonly open: (tab?: 'CONTROL' | 'CITY') => void;
  readonly close: () => void;
  readonly tick: () => number;
  readonly suspended: () => boolean;
  readonly session: StyleSlidersSession;
  readonly view: () => ReturnType<typeof session.getView>;
  readonly state: () => ReturnType<typeof session.getState>;
  readonly stats: () => ReturnType<typeof session.getStats>;
  readonly panelStats: () => ReturnType<ControlSlidersPanel['getStats']> | null;
  readonly versions: () => readonly string[];
  readonly head: () => string;
  readonly epoch: () => number;
  readonly fleetVersions: () => readonly string[];
  readonly log: () => readonly string[];
  readonly setValue: (field: StyleSliderField, value: number) => void;
  readonly queue: () => string;
  readonly restore: (versionId: string) => string;
  readonly rebase: () => void;
  readonly publishExternal: () => string;
  readonly switchSession: () => string;
  readonly submitJob: (segmentId: string) => string;
  readonly geometry: () => Readonly<Record<string, unknown>>;
  readonly projectControl: () => ReturnType<typeof projectControlSliders> | null;
}

const api: PlaytestApi = {
  open: (tab = 'CITY') => openPanel(tab),
  close: () => {
    panel?.closePanel();
    session.close();
    suspended = false;
    host.hidden = true;
    render();
  },
  tick: () => tick.value,
  suspended: () => suspended,
  session,
  view: () => session.getView(),
  state: () => session.getState(),
  stats: () => session.getStats(),
  panelStats: () => panel?.getStats() ?? null,
  versions: () => store.listVersions(PROFILE).map((version) => version.versionId),
  head: () => barrier.current().baseVersionId,
  epoch: () => barrier.current().learningEpoch,
  fleetVersions,
  log: () => publishLog,
  setValue: (field, value) => {
    const next = session.setValue(field, value);
    if (next !== null) panel?.setStyleDraft(next);
    render();
  },
  queue: () => session.queueApply(),
  restore: (versionId) => session.requestRestore(versionId),
  rebase: () => {
    const next = session.rebase();
    if (next !== null) panel?.setStyleDraft(next);
    render();
  },
  publishExternal: () => {
    const parent = barrier.current().baseVersionId,
      versionId = `external-v${store.listVersions(PROFILE).length + 1}`,
      derived = store.derive({
        profileId: PROFILE,
        versionId,
        parentVersionId: parent,
        segmentId: `external:${versionId}`,
        reason: 'MANUAL_TUNING external playtest',
        createdAt: new Date().toISOString(),
        delta: {
          profileVersionId: versionId,
          parentVersionId: parent,
          engineVersion: ENGINE,
          schemaVersion: 1,
          units: 'SI',
          values: [{ key: 'desired_acceleration', unit: 'm/s²', value: 4.2 }],
        },
      });
    if (derived.status !== 'ACCEPTED') return `REJECTED:${derived.rejection.code}`;
    const requested = barrier.requestChange({
      reason: 'NEW_PROFILE',
      targetProfileId: PROFILE,
      targetVersionId: versionId,
      importValid: true,
    });
    if (requested.status === 'REJECTED') return `BARRIER:${requested.code}`;
    tick.value += 1;
    const resolved = barrier.resolve();
    if (resolved.status !== 'APPLIED') return `RESOLVE:${resolved.status}`;
    tick.value += 1;
    activation.applyAt(tick.value);
    saved.versions = [
      ...saved.versions,
      {
        versionId,
        parentVersionId: parent,
        values: [{ key: 'desired_acceleration', unit: 'm/s²', value: 4.2 }],
        reason: 'MANUAL_TUNING external playtest',
        createdAt: new Date().toISOString(),
      },
    ];
    persist();
    session.refresh();
    const next = session.getDraft();
    if (next !== null) panel?.setStyleDraft(next);
    log(`publicat extern ${versionId}; draftul deschis este acum stale.`);
    render();
    return versionId;
  },
  switchSession: () => {
    target.sessionId = 'playtest-haos';
    target.worldEpoch = 2;
    session.observeTick(tick.value + 1);
    const next = session.getDraft();
    if (next !== null) panel?.setStyleDraft(next);
    render();
    return session.getState().view?.saveState ?? '';
  },
  submitJob: (segmentId) => {
    const tracked = barrier.trackJob({
      playerId: PLAYER,
      profileId: PROFILE,
      learningEpoch: barrier.current().learningEpoch,
      baseVersionId: barrier.current().baseVersionId,
      segmentId,
    });
    if (tracked.status === 'TRACKED') trackedJobs.add(segmentId);
    return tracked.status;
  },
  geometry: () => {
    const root = host.querySelector<HTMLElement>('.control-sliders');
    const list = host.querySelector<HTMLElement>('.style-sliders__list');
    const footer = host.querySelector<HTMLElement>('.control-sliders__footer');
    const styleRoot = host.querySelector<HTMLElement>('.style-sliders');
    const rect = (node: HTMLElement | null) => {
      if (node === null) return null;
      const box = node.getBoundingClientRect();
      return {
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
        top: Math.round(box.top),
        bottom: Math.round(box.bottom),
      };
    };
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      rect: rect(root),
      footer: rect(footer),
      stylePanel:
        styleRoot === null ? null : { ...rect(styleRoot), scrollHeight: styleRoot.scrollHeight },
      list: list === null ? null : { ...rect(list), scrollHeight: list.scrollHeight },
      rows: host.querySelectorAll('.style-sliders__row').length,
      ranges: host.querySelectorAll('.style-sliders__range').length,
      unavailable: host.querySelectorAll('.style-sliders__unavailable-row').length,
      tabs: host.querySelectorAll('[role="tab"]').length,
      buttons: host.querySelectorAll('button').length,
      cityTabDisabled:
        host.querySelector<HTMLButtonElement>('[id$="tab-city"]')?.hasAttribute('disabled') ?? null,
      saveState: styleRoot?.getAttribute('data-save-state') ?? null,
      globalListeners: panel?.getStats().globalListeners ?? null,
    };
  },
  projectControl: () => (panel === null ? null : panel.getView()),
};

declare global {
  interface Window {
    __cs230: PlaytestApi;
  }
}
window.__cs230 = api;
