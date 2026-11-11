import type { KpiImpactRead } from '../../src/economy';
import { createKpiImpactHud } from '../../src/ui';
import type {
  KpiImpactFidelity,
  KpiImpactHud,
  KpiImpactHudStats,
  KpiImpactMissionResult,
  KpiImpactSnapshot,
} from '../../src/ui';
import { composeKpiImpactSnapshot, projectKpiImpact } from '../../src/ui';
import { createKpiDocument, type KpiDocument, type KpiElement } from './kpi-history-fixture';

export const KPI_IMPACT_SESSION = 'session:214' as const;
export const KPI_IMPACT_NAMESPACE = 'city:economy' as const;
export const KPI_IMPACT_WORLD_EPOCH = 1 as const;

export interface ImpactSnapshotSources {
  readonly read: KpiImpactRead;
  readonly mission?: KpiImpactMissionResult;
  readonly fidelity?: KpiImpactFidelity;
}

export const DEFAULT_MISSION: KpiImpactMissionResult = Object.freeze({
  state: 'COMPLETED' as const,
  missionId: 'campaign-1-first-taxi',
  attempt: 1,
  xpGranted: 100,
  duplicateXp: 0,
});

export const DEFAULT_FIDELITY: KpiImpactFidelity = Object.freeze({
  controlMode: 'MANUAL' as const,
  controlIntervals: 8,
  comfortPenalty: 0,
});

/** Composes the three real planes over a 209 read; nothing is invented by the fixture. */
export function impactSnapshot(sources: ImpactSnapshotSources): KpiImpactSnapshot {
  return composeKpiImpactSnapshot({
    sessionId: KPI_IMPACT_SESSION,
    worldEpoch: KPI_IMPACT_WORLD_EPOCH,
    tick: sources.read.tick,
    namespace: KPI_IMPACT_NAMESPACE,
    service: sources.read,
    mission: sources.mission ?? DEFAULT_MISSION,
    fidelity: sources.fidelity ?? DEFAULT_FIDELITY,
  });
}

export interface KpiImpactHudHarness {
  readonly document: KpiDocument;
  readonly host: KpiElement;
  readonly hud: KpiImpactHud;
  readonly reads: number[];
  root(): KpiElement;
  plane(key: string): KpiElement;
  details(key: string): string[];
  setSnapshot(value: KpiImpactSnapshot | null): void;
  stats(): KpiImpactHudStats;
}

export interface KpiImpactHudHarnessOptions {
  readonly snapshot?: KpiImpactSnapshot | null;
  readonly minimumReadIntervalTicks?: number;
  readonly visible?: boolean;
}

/** Mounts the capped HUD over the deterministic fake DOM used by the other UI evidence. */
export function createKpiImpactHudHarness(
  options: KpiImpactHudHarnessOptions = {},
): KpiImpactHudHarness {
  const document = createKpiDocument(),
    host = document.createElement('div'),
    reads: number[] = [];
  let current: KpiImpactSnapshot | null = options.snapshot ?? null;
  const hud = createKpiImpactHud(host as unknown as HTMLElement, {
    read: () => {
      reads.push(current?.tick ?? -1);
      return current;
    },
    ...(options.minimumReadIntervalTicks === undefined
      ? {}
      : { minimumReadIntervalTicks: options.minimumReadIntervalTicks }),
    ...(options.visible === false ? { visible: false } : {}),
  });
  const root = () => host.children[0] as unknown as KpiElement;
  const findAll = (node: KpiElement, predicate: (value: KpiElement) => boolean): KpiElement[] => {
    const matches: KpiElement[] = [];
    for (const child of node.children as KpiElement[]) {
      if (predicate(child)) matches.push(child);
      matches.push(...findAll(child, predicate));
    }
    return matches;
  };
  const plane = (key: string) => {
    const found = findAll(root(), (child) => child.getAttribute('data-plane') === key)[0];
    if (found === undefined) throw new Error(`Missing impact HUD plane ${key}`);
    return found;
  };
  const details = (key: string) => {
    const list = findAll(plane(key), (child) => child.tagName === 'ul')[0];
    if (list === undefined) throw new Error(`Missing impact HUD details ${key}`);
    return list.children.map((child) => child.textContent);
  };
  return {
    document,
    host,
    hud,
    reads,
    root,
    plane,
    details,
    setSnapshot(value: KpiImpactSnapshot | null): void {
      current = value;
    },
    stats: () => hud.getStats(),
  };
}

export interface HudSimulation {
  readonly stats: KpiImpactHudStats;
  readonly statuses: readonly string[];
  readonly planeUpdatesBeforeChange: number;
  readonly rendersBeforeChange: number;
}

/**
 * Runs the HUD once per simulated tick with exactly one KPI change at `changeAt`, so the report can
 * compare 600 per-frame calls with 2 accepted renders and 3 plane writes.
 */
export function simulateHud(options: {
  readonly frames: number;
  readonly changeAt: number;
  readonly before: KpiImpactSnapshot;
  readonly after: KpiImpactSnapshot;
  readonly minimumReadIntervalTicks?: number;
}): HudSimulation {
  const harness = createKpiImpactHudHarness({
    snapshot: options.before,
    ...(options.minimumReadIntervalTicks === undefined
      ? {}
      : { minimumReadIntervalTicks: options.minimumReadIntervalTicks }),
  });
  const statuses: string[] = [];
  let planeUpdatesBeforeChange = 0,
    rendersBeforeChange = 0;
  for (let frame = 0; frame < options.frames; frame += 1) {
    if (frame === options.changeAt) harness.setSnapshot(options.after);
    statuses.push(harness.hud.update(frame));
    if (frame === options.changeAt - 1) {
      planeUpdatesBeforeChange = harness.stats().planeUpdates;
      rendersBeforeChange = harness.stats().renders;
    }
  }
  const stats = harness.stats();
  harness.hud.dispose();
  return Object.freeze({
    stats,
    statuses: Object.freeze(statuses),
    planeUpdatesBeforeChange,
    rendersBeforeChange,
  });
}

/** Convenience view of a composed snapshot for the text assertions. */
export function impactView(sources: ImpactSnapshotSources) {
  return projectKpiImpact(impactSnapshot(sources));
}
