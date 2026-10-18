import type { ServiceZoneCatalog, ServiceSiteQuery, ServiceSiteDecision } from '../world';
import { issueRecoveryRoad, recoveryTransform, recoveryIdentity } from '../vehicles';
import type {
  BodyIdentity,
  PhysicsRecoveryPort,
  PhysicsProbe,
  RecoveryInspection,
} from '../vehicles';
import type { ContractContext } from '../sessions';
import { requireContract, fields, readContext, contextFields } from '../sessions';

export type ServiceAvailability =
  | Readonly<{ status: 'DENIED'; semantic: ServiceSiteDecision; native: null }>
  | Readonly<{
      status: 'AVAILABLE' | 'OCCUPIED' | 'INVALID_SUPPORT';
      semantic: ServiceSiteDecision;
      native: RecoveryInspection;
    }>;

/** Explicit caller-owned030 port composition; no timers, native setters, steps or cache.
 * Context/physics/port stay caller-owned. This wrapper owns one synchronous admission slot.
 */
export function createServiceZoneAvailability(options: {
  readonly context: ContractContext;
  readonly catalog: ServiceZoneCatalog;
  readonly physics: Pick<PhysicsProbe, 'bodyIdentity' | 'readVehicleMechanics'>;
  readonly native: PhysicsRecoveryPort;
}) {
  const context = Object.freeze(readContext(fields(options.context, contextFields)));
  let disposed = false,
    active = false;
  function current(identity: BodyIdentity) {
    const actual = options.physics.bodyIdentity(identity.entityId);
    requireContract(actual === identity, 'Service native identity is stale');
  }
  return Object.freeze({
    inspect(query: ServiceSiteQuery, identity: BodyIdentity): ServiceAvailability {
      requireContract(!disposed && !active, 'Service availability disposed/reentrant');
      active = true;
      try {
        recoveryIdentity(identity);
        current(identity);
        const before = options.native.readNative(identity),
          mechanics = options.physics.readVehicleMechanics(identity.entityId);
        current(identity);
        const wheels = mechanics.wheels;
        requireContract(
          Number.isFinite(wheels.trackM) &&
            wheels.trackM > 0 &&
            Number.isFinite(wheels.wheelbaseM) &&
            wheels.wheelbaseM > 0 &&
            Number.isFinite(wheels.radiusM) &&
            wheels.radiusM > 0,
          'Service native mechanical geometry',
        );
        // Existing030 native geometry contract: Rapier addCar creates the fixed chassis
        // Cuboid(.85,.3,2) for both actual023 classes, then wheels at +/-track/2,
        // +/-wheelbase/2 with actual radius. This matches inspectPlacement's conservative
        // X/Z envelope exactly; it is not a wheel-only estimate or visual-mesh bound.
        const semantic = options.catalog.resolve(query, {
          halfWidthM: Math.max(0.85, wheels.trackM / 2 + wheels.radiusM),
          halfLengthM: Math.max(2, wheels.wheelbaseM / 2 + wheels.radiusM),
        });
        current(identity);
        const boundary = options.native.readNative(identity);
        requireContract(
          boundary.physicsStepSerial === before.physicsStepSerial,
          'Service physics advanced during semantic query',
        );
        requireContract(
          JSON.stringify(boundary) === JSON.stringify(before),
          'Service native state changed during semantic query',
        );
        const afterSemanticMechanics = options.physics.readVehicleMechanics(identity.entityId);
        requireContract(
          JSON.stringify(afterSemanticMechanics.wheels) === JSON.stringify(mechanics.wheels),
          'Service mechanical geometry changed during semantic query',
        );
        if (semantic.status === 'DENIED')
          return Object.freeze({ status: 'DENIED', semantic, native: null });
        // Authored metadata fixes X/Z; actual class/body native datum supplies only centre Y.
        // Native support still decides availability; body height is never assumed SAFE.
        const yaw = Math.PI / 2 - semantic.site.headingRad;
        const transform = recoveryTransform({
          positionM: {
            x: semantic.site.positionM.x,
            y: before.transform.positionM.y,
            z: semantic.site.positionM.z,
          },
          rotationQuaternion: { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) },
        });
        const inspection = options.native.inspectPlacement({
          identity,
          context,
          expectedPhysicsSerial: before.physicsStepSerial,
          transform,
          road: issueRecoveryRoad(semantic.corridor),
        });
        current(identity);
        const after = options.native.readNative(identity);
        requireContract(
          after.physicsStepSerial === before.physicsStepSerial &&
            inspection.physicsStepSerial === before.physicsStepSerial,
          'Service native query serial changed',
        );
        requireContract(
          JSON.stringify(after) === JSON.stringify(before),
          'Service readonly query changed native state',
        );
        requireContract(
          JSON.stringify(options.physics.readVehicleMechanics(identity.entityId).wheels) ===
            JSON.stringify(mechanics.wheels),
          'Service mechanical geometry changed during native query',
        );
        return Object.freeze({
          status:
            inspection.status === 'SAFE'
              ? 'AVAILABLE'
              : inspection.status === 'BLOCKED'
                ? 'OCCUPIED'
                : 'INVALID_SUPPORT',
          semantic,
          native: inspection,
        });
      } finally {
        active = false;
      }
    },
    getStats() {
      return Object.freeze({
        disposed,
        queriesInFlight: active ? 1 : 0,
        ownedNativePorts: 0,
        capacity: 1,
      });
    },
    dispose() {
      if (disposed) return;
      requireContract(!active, 'Service availability query active');
      disposed = true;
    },
  });
}
