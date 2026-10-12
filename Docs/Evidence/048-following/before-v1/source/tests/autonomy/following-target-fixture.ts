import { createRoadContext } from '../../src/autonomy/road-context';
import { createBehaviorFSM, projectBehaviorContext } from '../../src/autonomy/behavior-fsm';
import { evaluateCruiseTarget } from '../../src/autonomy/cruise-targets';
import type { CruiseProfile } from '../../src/autonomy/cruise-targets';
import type { BehaviorActor, BehaviorScope } from '../../src/autonomy/behavior-fsm';
import { roadContextFixture } from './road-context-reference';

/** Same-lane authored fixture uses actual044 gap/radius and045/046; physical readbacks supplied by caller. */
export function createFollowingTargetFixture(
  profile: CruiseProfile,
  actor: BehaviorActor,
  scope: BehaviorScope,
) {
  const fixture = roadContextFixture(false),
    road = createRoadContext(fixture.map, { priorityPolicy: fixture.policy }),
    behavior = createBehaviorFSM(scope);
  behavior.setActors([actor], scope);
  const path = fixture.graph.getDirectedPath('west-in').points;
  const [a, b] = path,
    yaw = Math.atan2(b.x - a.x, b.z - a.z);
  function vehicle(id: string, incarnation: number, distance: number, speed: number) {
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    return {
      id,
      incarnation,
      positionM: {
        x: a.x + ((b.x - a.x) * distance) / length,
        y: 0.8,
        z: a.z + ((b.z - a.z) * distance) / length,
      },
      headingRad: yaw,
      access: 'CIVIL' as const,
      speedMps: speed,
      radiusM: 1.2,
      route: null,
      distances: [],
    };
  }
  return {
    position(distance: number) {
      return vehicle(actor.id, actor.incarnation, distance, 0).positionM;
    },
    yaw,
    input(
      tick: number,
      egoSpeed: number,
      gap: number,
      leaderSpeed: number,
      leaderId: string | null = 'leader',
      leaderIncarnation = 1,
      distance = 20,
      stopping = false,
    ) {
      road.updateFrame({
        ...scope,
        tick,
        vehicles: [
          vehicle(actor.id, actor.incarnation, distance, Math.max(0, egoSpeed)),
          ...(leaderId === null
            ? []
            : [vehicle(leaderId, leaderIncarnation, distance + gap + 2.4, leaderSpeed)]),
        ],
        obstacles: [],
        zones: [],
        signals: [],
        completeness: { vehicles: true, obstacles: true, zones: true, signals: true },
      });
      const full = road.getContext(actor.id, { force: true })!,
        context = projectBehaviorContext(full)!;
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
      const cruiseInput = {
        ...scope,
        actor,
        decisionTick: tick,
        authority: 'AUTO' as const,
        profile,
        context,
        behavior: decision,
        facts:
          full.lane === null
            ? null
            : {
                version: '046-road-facts-v1' as const,
                ...scope,
                subject: actor,
                sourceTick: tick,
                laneId: context.laneId!,
                roadKind: 'URBAN' as const,
                postedLimitMps: full.lane.lane.speedLimitMps,
                curveRadiusM: null,
                intersectionApproach: false,
              },
        mechanics: {
          version: '031-coverage-046-v1' as const,
          classId: 'sedan' as const,
          classVersion: '023-mechanics-v1' as const,
          surface: 'dry-asphalt' as const,
          surfaceVersion: '026-flat-surfaces-v1' as const,
        },
      };
      return {
        cruiseInput,
        roadContext: full,
        observation: {
          version: '048-observation-v1' as const,
          units: 'SI' as const,
          ...scope,
          actor,
          tick,
          longitudinalSpeedMps: egoSpeed,
        },
        cruise: evaluateCruiseTarget(cruiseInput),
      };
    },
    dispose() {
      road.dispose();
      behavior.dispose();
      return { road: road.getStats(), behavior: behavior.getStats() };
    },
  };
}
