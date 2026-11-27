import { selectKpiHistory, selectKpiImpact } from '../economy';
import type { FleetKpiSnapshot, KpiHistorySelection, RideReview } from '../economy';
import type { RideRecord } from '../fleet';
import { composeKpiImpactSnapshot } from '../ui';
import type {
  KpiImpactControlMode,
  KpiImpactFidelity,
  KpiImpactMissionResult,
  KpiImpactSnapshot,
} from '../ui';
import type { LaneGraph } from '../world';

/**
 * PBI 267 dashboard composition over the already delivered read models.
 *
 * The popup, the city dashboard and the consequence HUD are projections, never owners:
 *
 * - KPI history is the unchanged 210 selection over the 209 retained month/day buckets;
 * - the consequence HUD is the unchanged 214 selection over the same 209 buckets, with the real
 *   control mode and the 139 comfort term of the last accepted review;
 * - the city dashboard is the unchanged 082 composition over the real 061 lifecycle and 065 health.
 *
 * Nothing here creates a second ledger, a second ride model or a second comfort calculation. A read
 * never walks the commercial ledger, so every projection keeps `historyScans` structurally `0`.
 */
export const KPI_DASHBOARD_COMPOSITION_VERSION = '267-kpi-dashboard-composition-v1' as const;

/** A mission plane for builds where 116/125 are not mounted yet. It grants no XP. */
export const EMPTY_KPI_IMPACT_MISSION: KpiImpactMissionResult = Object.freeze({
  state: 'NONE' as const,
  missionId: null,
  attempt: null,
  xpGranted: 0,
  duplicateXp: 0,
});

export interface KpiHistoryReadInput {
  readonly kpi: FleetKpiSnapshot;
}

/** The exact 210 selection; the popup mounts this, never a second history scanner. */
export function readKpiHistory(input: KpiHistoryReadInput): KpiHistorySelection {
  return selectKpiHistory(input.kpi);
}

export interface KpiImpactCompositionInput {
  readonly kpi: FleetKpiSnapshot;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly namespace: string;
  /** Real authoritative control mode of the frame the consequence is shown in. */
  readonly controlMode: KpiImpactControlMode;
  /** Last accepted 209 review; its evidence carries the real 139 comfort term. */
  readonly lastReview: RideReview | null;
  /** Real 116/125 settlement when the mission build exists; absent means `NONE` and 0 XP. */
  readonly mission?: KpiImpactMissionResult;
}

/**
 * The exact 214 snapshot. The service plane is the 209 read model; only mission and fidelity are
 * composed around it, and a missing mission is explicit (`NONE`, zero XP) instead of invented.
 */
export function readKpiImpact(input: KpiImpactCompositionInput): KpiImpactSnapshot {
  const service = selectKpiImpact(input.kpi),
    mission = input.mission ?? EMPTY_KPI_IMPACT_MISSION,
    fidelity: KpiImpactFidelity = Object.freeze({
      controlMode: input.controlMode,
      controlIntervals: input.lastReview?.controlIntervals ?? 0,
      comfortPenalty: input.lastReview?.evidence.comfortPenalty ?? null,
    });
  return composeKpiImpactSnapshot({
    sessionId: input.sessionId,
    worldEpoch: input.worldEpoch,
    tick: service.tick,
    namespace: input.namespace,
    service,
    mission,
    fidelity,
  });
}

/**
 * Real planned trip distance of one completed 061 ride, summed from the same 033 lane geometry the
 * tariff uses. A missing lane or an empty route is `null`, never an invented zero metre.
 */
export function rideTripDistanceM(
  graph: Pick<LaneGraph, 'getDirectedPath'>,
  ride: RideRecord,
): number | null {
  if (ride.tripRouteLaneIds.length === 0) return null;
  let total = 0;
  for (const laneId of ride.tripRouteLaneIds) {
    const path = graph.getDirectedPath(laneId);
    if (path === null) return null;
    total += path.lengthM;
  }
  return Number.isFinite(total) && total >= 0 ? Math.round(total * 1e6) / 1e6 : null;
}
