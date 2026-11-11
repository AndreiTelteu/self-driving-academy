import {
  createDailyProgress,
  dailyRewardId,
  type DailyProgress,
  type DailyProgressIngestResult,
} from '../../src/missions';
import {
  createDailyProgressPanel,
  type DailyProgressPanel,
  type DailyProgressSnapshot,
} from '../../src/ui';
import type { SimulationEvent } from '../../src/simulation';
import {
  DAILY_FIXTURE_PLAYER,
  calendarInput,
  learningOnlyCapabilities,
} from '../missions/mission-daily-fixture';
import { HudElement, type HudDocument, type HudEventInit } from './hud-dom';

/**
 * 212 daily progress fixture.
 *
 * The fixture composes the real 211 generator, the real 212 consumer and the real 212 panel. Events
 * are plain 007 envelopes validated by `parseSimulationEvent` inside the consumer, so nothing the
 * panel displays comes from the test: the objectives are the generated set, the progress is the real
 * ride/mode attribution and the reward is the 211 identity.
 *
 * The catalog is authored so each scenario owns a stable objective mix: one MANUAL objective, one
 * `ANY` service objective and one LEARNING objective. The generator still shuffles slots and picks
 * targets deterministically, exactly as in production.
 */
export const DAILY_SESSION_ID = 'session-212-daily';
export const DAILY_WORLD_EPOCH = 1 as const;
export const DAILY_PLAYER_ID = DAILY_FIXTURE_PLAYER;
export const DAILY_DATE = '2026-11-11' as const;
export const DAILY_TAXI = 'taxi:212' as const;
export const DAILY_SECOND_TAXI = 'taxi:212-second' as const;
export const DAILY_TICK_STEP = 60 as const;

type EventType = SimulationEvent['type'];

export function coreCatalog(): unknown {
  return {
    schemaVersion: 1,
    units: 'SI',
    version: '212-test-core-v1',
    families: [
      {
        familyId: 'daily-test-manual',
        version: '1',
        category: 'SKILL',
        controlRequirement: 'MANUAL',
        objectiveKind: 'MANUAL_DROPOFFS',
        learningKeyRequired: false,
        allowsManual: true,
        minCampaignMissions: 0,
        targets: [2],
        incidentBudgets: [null],
        windowTicksOptions: [null],
        minDurationOptions: [null],
        title: 'Curse MANUAL',
        label: 'Finalizează două curse cu intervenție MANUAL',
      },
      {
        familyId: 'daily-test-clean',
        version: '1',
        category: 'SERVICE',
        controlRequirement: 'ANY',
        objectiveKind: 'CLEAN_DROPOFFS',
        learningKeyRequired: false,
        allowsManual: true,
        minCampaignMissions: 0,
        targets: [2],
        incidentBudgets: [0],
        windowTicksOptions: [null],
        minDurationOptions: [null],
        title: 'Serviciu fără incident',
        label: 'Livrează pasageri fără incident',
      },
      {
        familyId: 'daily-test-learning',
        version: '1',
        category: 'EXPERIMENT',
        controlRequirement: 'LEARNING',
        objectiveKind: 'LEARNING_ACTIVATIONS',
        learningKeyRequired: true,
        allowsManual: false,
        minCampaignMissions: 0,
        targets: [1],
        incidentBudgets: [null],
        windowTicksOptions: [null],
        minDurationOptions: [null],
        title: 'Demonstrație LEARNING',
        label: 'Publică o versiune LEARNING pentru cheia deja suportată',
      },
    ],
  };
}

/** A catalog whose service objective declares a real evaluation window in ticks. */
export function windowCatalog(): unknown {
  return {
    schemaVersion: 1,
    units: 'SI',
    version: '212-test-window-v1',
    families: [
      {
        familyId: 'daily-test-manual',
        version: '1',
        category: 'SKILL',
        controlRequirement: 'MANUAL',
        objectiveKind: 'MANUAL_DROPOFFS',
        learningKeyRequired: false,
        allowsManual: true,
        minCampaignMissions: 0,
        targets: [2],
        incidentBudgets: [null],
        windowTicksOptions: [null],
        minDurationOptions: [null],
        title: 'Curse MANUAL',
        label: 'Finalizează două curse cu intervenție MANUAL',
      },
      {
        familyId: 'daily-test-window',
        version: '1',
        category: 'SERVICE',
        controlRequirement: 'ANY',
        objectiveKind: 'DROPOFFS',
        learningKeyRequired: false,
        allowsManual: true,
        minCampaignMissions: 0,
        targets: [2],
        incidentBudgets: [null],
        windowTicksOptions: [600],
        minDurationOptions: [null],
        title: 'Fereastră de serviciu',
        label: 'Execută două curse în fereastra declarată',
      },
      {
        familyId: 'daily-test-learning',
        version: '1',
        category: 'EXPERIMENT',
        controlRequirement: 'LEARNING',
        objectiveKind: 'LEARNING_ACTIVATIONS',
        learningKeyRequired: true,
        allowsManual: false,
        minCampaignMissions: 0,
        targets: [1],
        incidentBudgets: [null],
        windowTicksOptions: [null],
        minDurationOptions: [null],
        title: 'Demonstrație LEARNING',
        label: 'Publică o versiune LEARNING pentru cheia deja suportată',
      },
    ],
  };
}

export interface DailyEnvelope {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly eventId: string;
  readonly tick: number;
  readonly entityIds: readonly string[];
  readonly type: EventType;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface EnvelopeOptions {
  readonly sessionId?: string;
  readonly worldEpoch?: number;
  readonly eventId?: string;
  readonly entityIds?: readonly string[];
}

let sequence = 0;

/** One plain 007 envelope; the consumer validates it with the real parser. */
export function envelope(
  type: EventType,
  tick: number,
  payload: Readonly<Record<string, unknown>>,
  options: EnvelopeOptions = {},
): DailyEnvelope {
  sequence += 1;
  return {
    schemaVersion: 1,
    units: 'SI',
    sessionId: options.sessionId ?? DAILY_SESSION_ID,
    worldEpoch: options.worldEpoch ?? DAILY_WORLD_EPOCH,
    eventId: options.eventId ?? `212:${type.toLowerCase()}:${tick}:${sequence}`,
    tick,
    entityIds: [...(options.entityIds ?? [])],
    type,
    payload,
  };
}

export interface RideOptions {
  readonly mode?: 'AUTO' | 'MANUAL' | 'LEARNING';
  readonly incident?: boolean;
  readonly spanTicks?: number;
  readonly observedAtMs?: number;
}

export interface DailyHarnessOptions {
  readonly catalog?: unknown;
  readonly open?: boolean;
  readonly dailyDate?: string;
  readonly read?: () => DailyProgressSnapshot | null;
}

export interface DailyHarness {
  readonly progress: DailyProgress;
  readonly panel: DailyProgressPanel;
  readonly document: DailyPanelDocument;
  readonly host: DailyPanelElement;
  readonly surface: boolean[];
  readonly played: DailyProgressIngestResult[];
  readonly reads: () => number;
  observedAtMs(): number;
  setObserved(atMs: number): void;
  dayStartMs(): number;
  expiresAtMs(): number;
  nextTick(): number;
  skipTicks(count: number): number;
  instanceOf(kind: string): ReturnType<DailyProgress['read']>['instances'][number];
  ingest(event: DailyEnvelope, observedAtMs?: number): DailyProgressIngestResult;
  startManual(vehicleId?: string, mode?: 'MANUAL' | 'LEARNING'): DailyProgressIngestResult;
  endManual(vehicleId?: string): DailyProgressIngestResult;
  pickup(rideId: string, vehicleId?: string): number;
  dropoff(rideId: string, vehicleId?: string): DailyProgressIngestResult;
  collision(vehicleId?: string): DailyProgressIngestResult;
  profileActivate(versionId: string): DailyProgressIngestResult;
  fullStop(durationS: number, vehicleId?: string): DailyProgressIngestResult;
  laneChange(vehicleId?: string): DailyProgressIngestResult;
  leaderAcquired(vehicleId?: string): DailyProgressIngestResult;
  ride(rideId: string, options?: RideOptions): { pickupTick: number; dropoffTick: number };
  read(): DailyProgressSnapshot;
  refreshPanel(): void;
  hostPanel(): DailyPanelElement;
  dialog(): DailyPanelElement;
  objectiveNode(instanceId: string): DailyPanelElement;
  byClass(className: string): DailyPanelElement[];
  dispose(): void;
}

// ---------------------------------------------------------------------------------------------
// Deterministic focus DOM: HudElement plus `focus()`, `tabIndex` and an owned `activeElement`.
// ---------------------------------------------------------------------------------------------

export interface DailyPanelDocument extends HudDocument {
  activeElement: DailyPanelElement | null;
  createElement(tagName: string): DailyPanelElement;
}

export class DailyPanelElement extends HudElement {
  tabIndex = -1;
  focusCount = 0;
  focus(): void {
    this.focusCount += 1;
    (this.ownerDocument as DailyPanelDocument).activeElement = this;
  }
  /** Deterministic event delivery that bubbles through the owned ancestors, like the DOM. */
  send(type: string, init: HudEventInit = {}): void {
    let node: DailyPanelElement | null = this;
    while (node !== null) {
      const event = node.dispatchEvent(type, init);
      if (event.propagationStopped) return;
      node = node.parent as DailyPanelElement | null;
    }
  }
}

export function createDailyPanelDocument(): DailyPanelDocument {
  const document: DailyPanelDocument = {
    activeElement: null,
    createElement(tagName: string): DailyPanelElement {
      const element = new DailyPanelElement(tagName);
      element.ownerDocument = document;
      return element;
    },
  };
  return document;
}

export function byClass(root: HudElement, className: string): DailyPanelElement[] {
  const matches: DailyPanelElement[] = [];
  for (const child of root.children) {
    if (child.className.split(' ').includes(className)) matches.push(child as DailyPanelElement);
    matches.push(...byClass(child, className));
  }
  return matches;
}

/** Real 211 generator + real 212 consumer + real 212 panel over a deterministic DOM. */
export function createDailyHarness(options: DailyHarnessOptions = {}): DailyHarness {
  const document = createDailyPanelDocument(),
    host = document.createElement('div'),
    surface: boolean[] = [],
    played: DailyProgressIngestResult[] = [];
  let observed = calendarInput(options.dailyDate ?? DAILY_DATE).observedAtMs,
    tickClock = 0,
    readCount = 0,
    ticket = 0;

  const progress = createDailyProgress({
    playerId: DAILY_PLAYER_ID,
    sessionId: DAILY_SESSION_ID,
    worldEpoch: DAILY_WORLD_EPOCH,
    calendar: calendarInput(options.dailyDate ?? DAILY_DATE),
    capabilities: learningOnlyCapabilities(),
    generatedAtMs: observed,
    templateCatalog: options.catalog ?? coreCatalog(),
  });

  const read = (): DailyProgressSnapshot =>
    progress.read(observed) as unknown as DailyProgressSnapshot;

  const panel = createDailyProgressPanel(host as unknown as HTMLElement, {
    read: () => {
      readCount += 1;
      return options.read === undefined ? read() : options.read();
    },
    setSurface: (open) => {
      surface.push(open);
    },
    ...(options.open === true ? { open: true } : {}),
  });

  const nextTick = (): number => {
    tickClock += DAILY_TICK_STEP;
    return tickClock;
  };

  /** Moves the simulated clock forward without emitting an event. */
  const skipTicks = (count: number): number => {
    tickClock += DAILY_TICK_STEP * count;
    return tickClock;
  };

  const ingest = (event: DailyEnvelope, atMs?: number): DailyProgressIngestResult => {
    ticket += 1;
    const result = progress.ingest({ event, observedAtMs: atMs ?? observed });
    played.push(result);
    return result;
  };

  const startManual = (
    vehicleId: string = DAILY_TAXI,
    mode: 'MANUAL' | 'LEARNING' = 'MANUAL',
  ): DailyProgressIngestResult => {
    const atTick = nextTick();
    return ingest(
      envelope(
        'MANUAL_START',
        atTick,
        { vehicleId, controlMode: mode },
        { eventId: `212:manual-start:${vehicleId}:${atTick}`, entityIds: [vehicleId] },
      ),
    );
  };

  const endManual = (vehicleId: string = DAILY_TAXI): DailyProgressIngestResult => {
    const atTick = nextTick();
    return ingest(
      envelope(
        'MANUAL_END',
        atTick,
        { vehicleId, controlMode: 'MANUAL' },
        { eventId: `212:manual-end:${vehicleId}:${atTick}`, entityIds: [vehicleId] },
      ),
    );
  };

  const pickup = (rideId: string, vehicleId: string = DAILY_TAXI): number => {
    const atTick = nextTick();
    ingest(
      envelope(
        'PICKUP',
        atTick,
        { vehicleId, rideId },
        { eventId: `212:pickup:${rideId}`, entityIds: [vehicleId, rideId] },
      ),
    );
    return atTick;
  };

  const dropoff = (rideId: string, vehicleId: string = DAILY_TAXI): DailyProgressIngestResult => {
    const atTick = nextTick();
    return ingest(
      envelope(
        'DROPOFF',
        atTick,
        { vehicleId, rideId },
        { eventId: `212:dropoff:${rideId}`, entityIds: [vehicleId, rideId] },
      ),
    );
  };

  const collision = (vehicleId: string = DAILY_TAXI): DailyProgressIngestResult => {
    const atTick = nextTick();
    return ingest(
      envelope(
        'COLLISION',
        atTick,
        { vehicleId, otherEntityId: 'obstacle:212', impulseNs: 900 },
        {
          eventId: `212:collision:${vehicleId}:${atTick}`,
          entityIds: [vehicleId, 'obstacle:212'],
        },
      ),
    );
  };

  const profileActivate = (versionId: string): DailyProgressIngestResult => {
    const atTick = nextTick();
    return ingest(
      envelope(
        'PROFILE_ACTIVATE',
        atTick,
        { profileId: 'profile:212', versionId, learningEpoch: 1, activationTick: atTick },
        { eventId: `212:profile:${versionId}:${atTick}`, entityIds: ['profile:212'] },
      ),
    );
  };

  const fullStop = (
    durationS: number,
    vehicleId: string = DAILY_TAXI,
  ): DailyProgressIngestResult => {
    const atTick = nextTick();
    return ingest(
      envelope(
        'FULL_STOP',
        atTick,
        { vehicleId, opportunityId: `opportunity:212:${atTick}`, durationS },
        { eventId: `212:stop:${vehicleId}:${atTick}`, entityIds: [vehicleId] },
      ),
    );
  };

  const laneChange = (vehicleId: string = DAILY_TAXI): DailyProgressIngestResult => {
    const atTick = nextTick();
    return ingest(
      envelope(
        'LANE_CHANGE_COMPLETED',
        atTick,
        { vehicleId, opportunityId: `opportunity:212:${atTick}`, fromLaneId: 'a', toLaneId: 'b' },
        { eventId: `212:lane:${vehicleId}:${atTick}`, entityIds: [vehicleId] },
      ),
    );
  };

  const leaderAcquired = (vehicleId: string = DAILY_TAXI): DailyProgressIngestResult => {
    const atTick = nextTick();
    return ingest(
      envelope(
        'LEADER_ACQUIRED',
        atTick,
        { vehicleId, leaderId: 'leader:212', gapM: 12 },
        { eventId: `212:leader:${vehicleId}:${atTick}`, entityIds: [vehicleId, 'leader:212'] },
      ),
    );
  };

  /** One complete real ride: optional control interval, pickup, optional collision, dropoff. */
  const ride = (
    rideId: string,
    options_: RideOptions = {},
  ): { pickupTick: number; dropoffTick: number } => {
    const mode = options_.mode ?? 'AUTO';
    if (mode !== 'AUTO') startManual(DAILY_TAXI, mode);
    const pickupTick = pickup(rideId);
    tickClock += (options_.spanTicks ?? DAILY_TICK_STEP * 4) - DAILY_TICK_STEP;
    if (options_.incident === true) collision();
    const dropoffTick = nextTick();
    ingest(
      envelope(
        'DROPOFF',
        dropoffTick,
        { vehicleId: DAILY_TAXI, rideId },
        { eventId: `212:dropoff:${rideId}`, entityIds: [DAILY_TAXI, rideId] },
      ),
      options_.observedAtMs,
    );
    if (mode !== 'AUTO') endManual();
    return { pickupTick, dropoffTick };
  };

  const objectiveNode = (instanceId: string): DailyPanelElement => {
    const node = byClass(dialog(), 'daily-progress__objective-item').find(
      (candidate) => candidate.getAttribute('data-instance-id') === instanceId,
    );
    if (node === undefined) throw new Error(`Missing daily objective ${instanceId}`);
    return node;
  };

  const dialog = (): DailyPanelElement =>
    host.children[0]?.children[1] as unknown as DailyPanelElement;

  const harness: DailyHarness = {
    progress,
    panel,
    document,
    host,
    surface,
    played,
    reads: () => readCount,
    observedAtMs: () => observed,
    setObserved: (atMs) => {
      observed = atMs;
    },
    dayStartMs: () => progress.set().dayStartMs,
    expiresAtMs: () => progress.set().expiresAtMs,
    nextTick,
    skipTicks,
    instanceOf: (kind) => {
      const found = progress.read(observed).instances.find((entry) => entry.objectiveKind === kind);
      if (found === undefined) throw new Error(`Daily set has no ${kind} objective`);
      return found;
    },
    ingest,
    startManual,
    endManual,
    pickup,
    dropoff,
    collision,
    profileActivate,
    fullStop,
    laneChange,
    leaderAcquired,
    ride,
    read,
    refreshPanel: () => {
      panel.refresh();
    },
    hostPanel: () => host.children[0] as unknown as DailyPanelElement,
    dialog,
    objectiveNode,
    byClass: (className) => byClass(host, className),
    dispose: () => {
      panel.dispose();
    },
  };
  return harness;
}

/** The 211 reward identity of one instance, used to prove the single grant. */
export function rewardIdOf(instanceId: string): string {
  return dailyRewardId(DAILY_PLAYER_ID, instanceId);
}
