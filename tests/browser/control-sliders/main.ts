import { createControlSlidersSession, createPauseFocusOwner } from '../../../src/app';
import type { ControlSlidersSession } from '../../../src/app';
import {
  createDefaultSettings,
  createSettingsStore,
  getControlPreferencesVersion,
  parseRuntimeSettings,
  type RuntimeSettings,
} from '../../../src/settings';
import {
  createControlSlidersPanel,
  projectControlSliders,
  type ControlSliderField,
  type ControlSlidersDraft,
} from '../../../src/ui';
import type { InterventionTarget } from '../../../src/telemetry';

/**
 * 229 visual playtest page.
 *
 * It composes the real popup, the real 070 pause/focus owner, the real 009 settings store and the
 * real 229 session. Two host adapters are deliberately local to this page and are not production
 * contracts: (1) the settings record is mirrored in `localStorage` so a browser reload can prove
 * that the saved control revision survives, and (2) the tick loop freezes while the popup suspends
 * the world, so the pause is visible. No renderer, physics or telemetry lifecycle is simulated
 * beyond logging the real `CONTROL_PREFERENCES_CHANGE` object at the tick it is emitted.
 */

const PLAYER = 'playtest-229';
const STORAGE_KEY = 'sda-229-playtest-settings';

interface PlaytestLogEntry {
  readonly tick: number;
  readonly from: string;
  readonly to: string;
  readonly reason: string;
}

const status = document.getElementById('playtest-status') as HTMLParagraphElement,
  openButton = document.getElementById('playtest-open') as HTMLButtonElement,
  logView = document.getElementById('playtest-log') as HTMLPreElement,
  host = document.getElementById('playtest-host') as HTMLDivElement;

function loadSettings(): RuntimeSettings {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return createDefaultSettings(PLAYER, 3);
  try {
    return parseRuntimeSettings(JSON.parse(raw) as unknown);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return createDefaultSettings(PLAYER, 3);
  }
}

const settings = loadSettings(),
  store = createSettingsStore(settings);
let tick = 0,
  suspended = false,
  heldResets = 0,
  lastPublishedVersion = getControlPreferencesVersion(store.getSnapshot()),
  segments: PlaytestLogEntry[] = [];

const pauseFocus = createPauseFocusOwner({
    suspend: () => {
      suspended = true;
      renderStatus();
    },
    resume: () => {
      suspended = false;
      renderStatus();
    },
    resetHeldCommands: () => {
      heldResets += 1;
      renderStatus();
    },
  }),
  target = (): InterventionTarget => {
    const control = store.getSnapshot();
    return Object.freeze({
      schemaVersion: 1,
      units: 'SI' as const,
      sessionId: 'playtest-229',
      worldEpoch: 1,
      version: '069-intervention-target-v1' as const,
      playerId: control.playerId,
      profileId: 'playtest-profile',
      baseVersionId: 'style-v1',
      learningEpoch: 1,
      controlPreferencesVersion: getControlPreferencesVersion(control),
      engineVersion: 'playtest-engine',
      mapVersion: 'playtest-map',
      inputType: 'KEYBOARD' as const,
      learningEligible: false,
    });
  },
  session: ControlSlidersSession = createControlSlidersSession({
    store,
    readSettings: () => store.getSnapshot(),
    pauseFocus,
    resetHeldCommands: () => {
      heldResets += 1;
      renderStatus();
    },
    readTarget: target,
  });

function renderStatus(): void {
  const state = session.getState();
  status.textContent = `tick ${tick} · ${suspended ? 'PAUZĂ' : 'rulează'} · popup ${state.open ? 'deschis' : 'închis'} · input eliberat ${heldResets}× · versiune control ${store.getSnapshot().input.control.version} · ${state.message}`;
  logView.textContent =
    segments.length === 0
      ? 'Niciun segment închis/redeschis încă.'
      : segments
          .map((entry) => `tick ${entry.tick}: ${entry.from} → ${entry.to} (${entry.reason})`)
          .join('\n');
}

let panel: ReturnType<typeof createControlSlidersPanel> | null = null;

function mountPanel(): void {
  const draft = session.getDraft();
  if (draft === null) return;
  host.hidden = false;
  if (panel === null) {
    panel = createControlSlidersPanel(host, draft, {
      close: () => {
        session.close();
        host.hidden = true;
        renderStatus();
      },
      onChange: (next: ControlSlidersDraft) => {
        session.adopt(next);
        renderStatus();
      },
      apply: (next: ControlSlidersDraft) => {
        session.adopt(next);
        const outcome = session.queueApply();
        if (outcome === 'QUEUED') {
          // The popup is a 070 pause surface: closing it resumes the clock, and the queued change is
          // published at the first tick after the resume (the segment closes and reopens there).
          session.close();
          host.hidden = true;
        } else {
          panel?.announce(session.getState().message);
        }
        renderStatus();
      },
      cancel: () => {
        session.withdraw();
        session.revert();
        renderStatus();
      },
      reset: (next: ControlSlidersDraft) => {
        session.adopt(next);
        renderStatus();
      },
    });
  } else {
    panel.setDraft(draft);
  }
  panel.openPanel();
  renderStatus();
}

function openPopup(): void {
  const opened = session.open();
  if (opened !== 'OPENED') {
    renderStatus();
    return;
  }
  tickLoop();
  mountPanel();
}

function tickLoop(): void {
  if (suspended) return;
  tick += 1;
  session.observeTick(tick);
  const result = session.applyAtTick(tick);
  if (result.status === 'APPLIED' && result.change !== null && result.settings !== null) {
    const next = result.change.target.controlPreferencesVersion;
    segments = [
      ...segments,
      { tick: result.tick, from: lastPublishedVersion, to: next, reason: result.change.reason },
    ];
    lastPublishedVersion = next;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(result.settings));
    panel?.setDraft(session.getDraft() ?? panel.getDraft());
    panel?.announce(
      `Aplicat la tick ${result.tick}: versiunea de control ${result.settings.input.control.version}.`,
    );
  }
  renderStatus();
}

openButton.addEventListener('click', openPopup);
setInterval(tickLoop, 16);
renderStatus();

interface PlaytestApi {
  readonly open: () => void;
  readonly close: () => void;
  readonly session: ControlSlidersSession;
  readonly tick: () => number;
  readonly suspended: () => boolean;
  readonly heldResets: () => number;
  readonly segments: () => readonly PlaytestLogEntry[];
  readonly settings: () => RuntimeSettings;
  readonly view: () => ReturnType<typeof projectControlSliders> | null;
  readonly setValue: (field: ControlSliderField, value: number) => void;
  readonly queue: () => string;
  readonly panelStats: () => Readonly<Record<string, string | number | boolean>> | null;
}

const api: PlaytestApi = {
  open: openPopup,
  close: () => {
    session.close();
    host.hidden = true;
    renderStatus();
  },
  session,
  tick: () => tick,
  suspended: () => suspended,
  heldResets: () => heldResets,
  segments: () => segments,
  settings: () => store.getSnapshot(),
  view: () => session.getView(),
  setValue: (field, value) => {
    session.setValue(field, value);
    panel?.setDraft(session.getDraft() ?? panel.getDraft());
    renderStatus();
  },
  queue: () => session.queueApply(),
  panelStats: () => panel?.getStats() ?? null,
};

declare global {
  interface Window {
    __cs229: PlaytestApi;
  }
}

window.__cs229 = api;
