import {
  createMissionRewardsLedger,
  type CampaignProgress,
  type MissionCatalog,
  type MissionDefinition,
  type MissionInstance,
  type MissionRewardsLedger,
  type MissionTracker,
} from '../../src/missions';
import {
  composeMissionPanelSnapshot,
  createMissionPanel,
  type MissionPanel,
  type MissionPanelSnapshot,
} from '../../src/ui';
import {
  MISSION_SESSION_ID,
  MISSION_WORLD_EPOCH,
  collision,
  createMissionTestTracker,
} from '../missions/mission-fixture';
import type { SimulationEvent } from '../../src/simulation';
import { HudElement, type HudDocument, type HudEventInit } from './hud-dom';

/**
 * 126 mission panel fixture.
 *
 * The panel never owns campaign data: this fixture composes the real 116 tracker and the real 125
 * ledger, advances missions with validated 007 events and settles only real completed instances.
 * Every value the panel displays therefore comes from the delivered contracts, not from the test.
 */
/**
 * The panel reads the same world the real 116 tracker and the 125 ledger belong to, so the fixture
 * cannot pass an event the delivered contracts would refuse as foreign.
 */
export const MISSION_PANEL_SESSION_ID = MISSION_SESSION_ID;
export const MISSION_PANEL_WORLD_EPOCH = MISSION_WORLD_EPOCH;
export const MISSION_PANEL_TAXI = 'taxi:126';
export const MISSION_PANEL_COLLISION_TAXI = 'taxi:126-collision';
export const MISSION_PANEL_TICK_STEP = 10;

interface MissionEnvelope {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly eventId: string;
  readonly tick: number;
  readonly entityIds: readonly string[];
  readonly type: SimulationEvent['type'];
  readonly payload: Readonly<Record<string, unknown>>;
}

/** The real 007 events that satisfy each authored campaign objective (same script as 125). */
export function campaignMissionEvents(
  missionId: string,
  startTick: number,
): readonly MissionEnvelope[] {
  const tick = startTick + 1;
  switch (missionId) {
    case 'campaign-1-first-taxi':
      return [
        event('MANUAL_START', `126:manual-start:${tick}`, tick, [MISSION_PANEL_TAXI], {
          vehicleId: MISSION_PANEL_TAXI,
          controlMode: 'MANUAL',
        }),
        event('DROPOFF', `126:dropoff:${tick + 1}`, tick + 1, [MISSION_PANEL_TAXI, 'ride:126:1'], {
          vehicleId: MISSION_PANEL_TAXI,
          rideId: 'ride:126:1',
        }),
      ];
    case 'campaign-2-first-demonstration':
      return [
        event('PROFILE_ACTIVATE', `126:profile:${tick}`, tick, ['profile:126'], {
          profileId: 'profile:126',
          versionId: 'version-126:1',
          learningEpoch: 1,
          activationTick: tick,
        }),
      ];
    case 'campaign-3-following-distance':
      return [
        event('LEADER_ACQUIRED', `126:leader:${tick}`, tick, [MISSION_PANEL_TAXI, 'leader:126:1'], {
          vehicleId: MISSION_PANEL_TAXI,
          leaderId: 'leader:126:1',
          gapM: 12,
        }),
        event(
          'LEADER_ACQUIRED',
          `126:leader:${tick + 1}`,
          tick + 1,
          [MISSION_PANEL_TAXI, 'leader:126:2'],
          { vehicleId: MISSION_PANEL_TAXI, leaderId: 'leader:126:2', gapM: 20 },
        ),
      ];
    case 'campaign-4-stops-and-signals':
      return [
        event('FULL_STOP', `126:stop:${tick}`, tick, [MISSION_PANEL_TAXI], {
          vehicleId: MISSION_PANEL_TAXI,
          opportunityId: 'opportunity:126:1',
          durationS: 1.6,
        }),
        event('FULL_STOP', `126:stop:${tick + 1}`, tick + 1, [MISSION_PANEL_TAXI], {
          vehicleId: MISSION_PANEL_TAXI,
          opportunityId: 'opportunity:126:2',
          durationS: 1.6,
        }),
      ];
    case 'campaign-5-passenger':
      return [
        event('DROPOFF', `126:dropoff:${tick}`, tick, [MISSION_PANEL_TAXI, 'ride:126:5'], {
          vehicleId: MISSION_PANEL_TAXI,
          rideId: 'ride:126:5',
        }),
      ];
    case 'campaign-6-city-copies-you':
      return [
        event('PROFILE_ACTIVATE', `126:profile:${tick}`, tick, ['profile:126'], {
          profileId: 'profile:126',
          versionId: 'version-126:2',
          learningEpoch: 1,
          activationTick: tick,
        }),
      ];
    case 'campaign-7-changing-a-habit':
      return [
        event('PROFILE_ACTIVATE', `126:profile:${tick}`, tick, ['profile:126'], {
          profileId: 'profile:126',
          versionId: 'version-126:3',
          learningEpoch: 1,
          activationTick: tick,
        }),
        event('PROFILE_ACTIVATE', `126:profile:${tick + 1}`, tick + 1, ['profile:126'], {
          profileId: 'profile:126',
          versionId: 'version-126:4',
          learningEpoch: 1,
          activationTick: tick + 1,
        }),
      ];
    case 'campaign-8-fleet-challenge':
      return [
        event('DROPOFF', `126:dropoff:${tick}`, tick, [MISSION_PANEL_TAXI, 'ride:126:8a'], {
          vehicleId: MISSION_PANEL_TAXI,
          rideId: 'ride:126:8a',
        }),
        event('DROPOFF', `126:dropoff:${tick + 1}`, tick + 1, [MISSION_PANEL_TAXI, 'ride:126:8b'], {
          vehicleId: MISSION_PANEL_TAXI,
          rideId: 'ride:126:8b',
        }),
        event('DROPOFF', `126:dropoff:${tick + 2}`, tick + 2, [MISSION_PANEL_TAXI, 'ride:126:8c'], {
          vehicleId: MISSION_PANEL_TAXI,
          rideId: 'ride:126:8c',
        }),
      ];
    default:
      throw new Error(`No 126 fixture script for mission ${missionId}`);
  }
}

function event(
  type: SimulationEvent['type'],
  eventId: string,
  tick: number,
  entityIds: readonly string[],
  payload: Readonly<Record<string, unknown>>,
): MissionEnvelope {
  return {
    schemaVersion: 1,
    units: 'SI',
    sessionId: MISSION_PANEL_SESSION_ID,
    worldEpoch: MISSION_PANEL_WORLD_EPOCH,
    eventId,
    tick,
    entityIds: [...entityIds],
    type,
    payload,
  };
}

// ---------------------------------------------------------------------------------------------
// Deterministic focus DOM: HudElement plus `focus()`, `tabIndex` and an owned `activeElement`.
// ---------------------------------------------------------------------------------------------

export interface MissionDocument extends HudDocument {
  activeElement: MissionElement | null;
  createElement(tagName: string): MissionElement;
}

export class MissionElement extends HudElement {
  tabIndex = -1;
  focusCount = 0;
  focus(): void {
    this.focusCount += 1;
    (this.ownerDocument as MissionDocument).activeElement = this;
  }
  /**
   * Deterministic event delivery that bubbles through the owned ancestors, exactly like the DOM:
   * a `keydown` sent to a mission button reaches the dialog listener that owns the keyboard trap.
   */
  send(type: string, init: HudEventInit = {}): void {
    let node: MissionElement | null = this;
    while (node !== null) {
      const event = node.dispatchEvent(type, init);
      if (event.propagationStopped) return;
      node = node.parent as MissionElement | null;
    }
  }
}

export function createMissionDocument(): MissionDocument {
  const document: MissionDocument = {
    activeElement: null,
    createElement(tagName: string): MissionElement {
      const element = new MissionElement(tagName);
      element.ownerDocument = document;
      return element;
    },
  };
  return document;
}

export function byMissionClass(root: HudElement, className: string): MissionElement[] {
  const matches: MissionElement[] = [];
  for (const child of root.children) {
    if (child.className.split(' ').includes(className)) matches.push(child as MissionElement);
    matches.push(...byMissionClass(child, className));
  }
  return matches;
}

export interface MissionPanelHarnessOptions {
  readonly catalog?: MissionCatalog;
  readonly open?: boolean;
  /** Replace the composed read; used to prove stale and empty reads explicitly. */
  readonly read?: () => MissionPanelSnapshot | null;
}

export interface MissionPanelHarness {
  readonly document: MissionDocument;
  readonly host: MissionElement;
  readonly panel: MissionPanel;
  readonly tracker: MissionTracker;
  readonly ledger: MissionRewardsLedger;
  readonly surface: boolean[];
  readonly reads: number;
  tick(): number;
  start(missionId: string, difficulty?: 'EASY' | 'NORMAL' | 'HARD'): MissionInstance;
  complete(missionId: string): MissionInstance;
  failWithBudget(missionId: string): MissionInstance;
  failWithWindow(missionId: string): MissionInstance;
  failExplicit(missionId: string, reason: 'SCENARIO_RESET' | 'PLAYER_ABANDONED'): MissionInstance;
  replay(instance: MissionInstance): MissionInstance;
  snapshot(): MissionPanelSnapshot;
  compose(catalog: MissionCatalog): MissionPanelSnapshot;
  progress(): CampaignProgress;
  definition(missionId: string): MissionDefinition;
  instance(instanceId: string): MissionInstance | undefined;
  trigger(): MissionElement;
  dialog(): MissionElement;
  missionButton(missionId: string): MissionElement;
  missionDetails(missionId: string): MissionElement;
  closeByEscape(): void;
  trackerFacts(): string;
  progressFacts(): string;
  dispose(): void;
}

/** Real 116 tracker plus real 125 ledger plus the 126 panel over a deterministic DOM. */
export function createMissionPanelHarness(
  options: MissionPanelHarnessOptions = {},
): MissionPanelHarness {
  const document = createMissionDocument(),
    host = document.createElement('div'),
    surface: boolean[] = [],
    tracker =
      options.catalog === undefined
        ? createMissionTestTracker()
        : createMissionTestTracker({ catalog: options.catalog }),
    ledger = createMissionRewardsLedger({ catalog: tracker.catalog() });
  let clock = 100,
    readCount = 0;
  const nextTick = (): number => {
    clock += MISSION_PANEL_TICK_STEP;
    return clock;
  };
  const advanceClock = (value: number): void => {
    clock = Math.max(clock, value);
  };
  const compose = (catalog: MissionCatalog): MissionPanelSnapshot =>
    composeMissionPanelSnapshot({
      sessionId: MISSION_PANEL_SESSION_ID,
      worldEpoch: MISSION_PANEL_WORLD_EPOCH,
      tick: clock,
      catalog,
      progress: ledger.progress(),
      instances: tracker.instances(),
    });
  const snapshot = (): MissionPanelSnapshot => compose(tracker.catalog());

  const settleCompleted = (instanceId: string): MissionInstance => {
    const instance = tracker.instance(instanceId);
    if (instance === undefined || instance.state !== 'COMPLETED')
      throw new Error(`Mission ${instanceId} did not complete in the 126 fixture`);
    const result = ledger.settle({ instance });
    if (result.status === 'DUPLICATE')
      throw new Error(`Mission ${instanceId} was already settled in the 126 fixture`);
    return instance;
  };

  const finish = (missionId: string, startTick: number): MissionInstance => {
    let completedId: string | null = null;
    for (const value of campaignMissionEvents(missionId, startTick)) {
      const result = tracker.ingest(value);
      if (result.completed.length > 0) completedId = result.completed[0]!;
    }
    if (completedId === null)
      throw new Error(`Mission ${missionId} produced no real completion in the 126 fixture`);
    const instance = settleCompleted(completedId);
    advanceClock((instance.completedTick ?? startTick) + MISSION_PANEL_TICK_STEP);
    return instance;
  };

  const start = (missionId: string, difficulty?: 'EASY' | 'NORMAL' | 'HARD'): MissionInstance => {
    const result = tracker.start({
      missionId,
      tick: nextTick(),
      ...(difficulty === undefined ? {} : { difficulty }),
    });
    return result.instance;
  };

  const replay = (instance: MissionInstance): MissionInstance => {
    const result = tracker.replay({ instanceId: instance.instanceId, tick: nextTick() });
    return result.instance;
  };

  /** Reuses the active attempt, replays the latest terminal one, or starts attempt 1. */
  const beginAttempt = (
    missionId: string,
    difficulty?: 'EASY' | 'NORMAL' | 'HARD',
  ): MissionInstance => {
    const latest = tracker
      .instances()
      .filter((entry) => entry.missionId === missionId)
      .at(-1);
    if (latest === undefined) return start(missionId, difficulty);
    if (latest.state === 'ACTIVE') return latest;
    return replay(latest);
  };

  /** Completes the mission with real 007 events, replaying its latest terminal attempt first. */
  const complete = (missionId: string): MissionInstance => {
    const started = beginAttempt(missionId);
    return finish(missionId, started.startedTick);
  };

  const failWithBudget = (missionId: string): MissionInstance => {
    const started = beginAttempt(missionId),
      budget = tracker.definition(missionId)?.incidentBudget ?? 0;
    let instance = started;
    for (let index = 0; index <= budget; index += 1) {
      const atTick = nextTick(),
        result = tracker.ingest(
          collision(
            `126:collision:${missionId}:${started.attempt}:${index}`,
            atTick,
            MISSION_PANEL_COLLISION_TAXI,
          ),
        );
      const failedId = result.failed[0];
      if (failedId !== undefined) {
        const failed = tracker.instance(failedId);
        if (failed !== undefined) instance = failed;
        break;
      }
    }
    if (instance.state !== 'FAILED')
      throw new Error(`Mission ${missionId} did not exceed its incident budget`);
    return instance;
  };

  const failWithWindow = (missionId: string): MissionInstance => {
    const started = beginAttempt(missionId),
      window = tracker.definition(missionId)?.windowTicks ?? null;
    if (window === null) throw new Error(`Mission ${missionId} has no evaluation window`);
    const result = tracker.advance(started.startedTick + window + 1);
    advanceClock(started.startedTick + window + 1);
    const failedId = result.expired[0];
    const failed = failedId === undefined ? undefined : tracker.instance(failedId);
    if (failed === undefined || failed.state !== 'FAILED')
      throw new Error(`Mission ${missionId} did not expire its evaluation window`);
    return failed;
  };

  const failExplicit = (
    missionId: string,
    reason: 'SCENARIO_RESET' | 'PLAYER_ABANDONED',
  ): MissionInstance => {
    const started = beginAttempt(missionId);
    return tracker.fail({ instanceId: started.instanceId, reason, tick: nextTick() });
  };

  const read = (): MissionPanelSnapshot | null => {
    readCount += 1;
    return options.read === undefined ? snapshot() : options.read();
  };
  const panel = createMissionPanel(host as unknown as HTMLElement, {
    read,
    setSurface: (open) => {
      surface.push(open);
    },
    ...(options.open === true ? { open: true } : {}),
  });
  const trigger = (): MissionElement => host.children[0]?.children[0] as unknown as MissionElement;
  const dialog = (): MissionElement => host.children[0]?.children[1] as unknown as MissionElement;
  const missionButton = (missionId: string): MissionElement => {
    const button = byMissionClass(dialog(), 'mission-panel__select').find(
      (candidate) => candidate.getAttribute('data-mission-id') === missionId,
    );
    if (button === undefined) throw new Error(`Missing mission button ${missionId}`);
    return button;
  };
  const missionDetails = (missionId: string): MissionElement => {
    const details = byMissionClass(dialog(), 'mission-panel__details').find((candidate) =>
      candidate.getAttribute('id')?.endsWith(missionId),
    );
    if (details === undefined) throw new Error(`Missing mission details ${missionId}`);
    return details;
  };

  return Object.freeze({
    document,
    host,
    panel,
    tracker,
    ledger,
    surface,
    get reads() {
      return readCount;
    },
    tick: () => clock,
    start,
    complete,
    failWithBudget,
    failWithWindow,
    failExplicit,
    replay,
    snapshot,
    compose,
    progress: () => ledger.progress(),
    definition: (missionId: string) => {
      const definition = tracker.definition(missionId);
      if (definition === undefined) throw new Error(`Unknown mission ${missionId}`);
      return definition;
    },
    instance: (instanceId: string) => tracker.instance(instanceId),
    trigger,
    dialog,
    missionButton,
    missionDetails,
    closeByEscape: () => dialog().send('keydown', { key: 'Escape' }),
    trackerFacts: () => JSON.stringify(tracker.stats()),
    progressFacts: () =>
      JSON.stringify({
        progress: ledger.progress(),
        stats: ledger.stats(),
        instances: tracker.instances(),
        tracker: tracker.stats(),
      }),
    dispose: () => {
      panel.dispose();
    },
  });
}
