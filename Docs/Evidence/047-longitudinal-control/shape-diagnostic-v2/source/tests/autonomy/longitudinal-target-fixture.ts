import { createRoadContext } from '../../src/autonomy/road-context';
import { createBehaviorFSM, projectBehaviorContext } from '../../src/autonomy/behavior-fsm';
import { evaluateCruiseTarget } from '../../src/autonomy/cruise-targets';
import type { CruiseProfile } from '../../src/autonomy/cruise-targets';
import type { BehaviorActor, BehaviorScope } from '../../src/autonomy/behavior-fsm';
import type { RoadSurfaceId } from '../../src/vehicles/road-surfaces';
import { roadContextFixture } from './road-context-reference';

/** Actual044/045/046 target producer with explicitly synthetic, fixed authored lane facts.
 * It does not claim live obstacle perception or048 following-distance planning. */
export function createLongitudinalTargetFixture(
  profile: CruiseProfile,
  actor: BehaviorActor,
  scope: BehaviorScope,
) {
  const fixture = roadContextFixture(false),
    road = createRoadContext(fixture.map, { priorityPolicy: fixture.policy }),
    behavior = createBehaviorFSM(scope);
  behavior.setActors([actor], scope);
  return {
    target(
      tick: number,
      stopping = true,
      classId: 'sedan' | 'compact' = 'sedan',
      surface: RoadSurfaceId = 'dry-asphalt',
    ) {
      const initial = fixture.frame.vehicles[0];
      road.updateFrame({
        ...fixture.frame,
        ...scope,
        tick,
        vehicles: [{ ...initial, id: actor.id, incarnation: actor.incarnation }],
        signals: fixture.frame.signals.map((signal) => ({ ...signal, tick })),
      });
      const full = road.getContext(actor.id, { force: true })!,
        context = projectBehaviorContext(full)!;
      if (!full.lane || !context?.laneId) throw new Error('Missing authored044 lane');
      const decision = behavior.decide({
        ...scope,
        actor,
        decisionTick: tick,
        context,
        facts: {
          version: '045-decision-facts-v1',
          profileVersionId: profile.versionId,
          routeBlocked: false,
          stop: stopping ? 'REQUESTED' : 'NONE',
          yield: 'NONE',
          service: 'NONE',
          laneChange: 'NONE',
        },
      });
      return evaluateCruiseTarget({
        ...scope,
        actor,
        decisionTick: tick,
        authority: 'AUTO',
        profile,
        context,
        behavior: decision,
        facts: {
          version: '046-road-facts-v1',
          ...scope,
          subject: actor,
          sourceTick: tick,
          laneId: context.laneId,
          roadKind: 'URBAN',
          postedLimitMps: full.lane.lane.speedLimitMps,
          curveRadiusM: null,
          intersectionApproach: false,
        },
        mechanics: {
          version: '031-coverage-046-v1',
          classId,
          classVersion: '023-mechanics-v1',
          surface,
          surfaceVersion: '026-flat-surfaces-v1',
        },
      });
    },
    dispose() {
      road.dispose();
      behavior.dispose();
    },
  };
}
