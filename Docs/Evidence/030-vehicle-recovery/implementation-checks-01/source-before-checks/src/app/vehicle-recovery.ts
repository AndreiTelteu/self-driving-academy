import { createVehicleRecovery } from '../vehicles';
import type { BodyIdentity, PhysicsProbe, VehicleController, createVehicleDamage } from '../vehicles';
import type { ControlAuthority } from '../input';
import { bindRecoveryInput } from '../input';
import { createRecoveryHud } from '../ui';
import type { LaneGraph, RoadAccess } from '../world';
import type { EventBus } from '../simulation';
import type { ContractContext } from '../sessions';
import type { InputPreferences } from '../settings';
import type { InterventionSegment } from '../telemetry';
import { createRecoveryRoadProvider } from './vehicle-recovery-road';
import { createRecoverySegmentBoundary } from './vehicle-recovery-segment';

/** Owns030 feature resources only. Existing world/controller/authority/damage/bus stay caller-owned. */
export function createVehicleRecoveryFeature(options: {
  readonly context: ContractContext;
  readonly physics: PhysicsProbe;
  readonly controller: VehicleController;
  readonly authority: ControlAuthority;
  readonly damage: ReturnType<typeof createVehicleDamage>;
  readonly eventBus: EventBus;
  readonly graph: LaneGraph;
  readonly segment: { read(identity: BodyIdentity): InterventionSegment | null;
    write(identity: BodyIdentity, closed: InterventionSegment, operationId: string): void };
  readonly clearAddressedInput: (identity: BodyIdentity) => void;
  readonly surface: HTMLElement;
  readonly bindings: InputPreferences['bindings'];
  readonly container: HTMLElement;
  readonly enabled?: () => boolean;
}) {
  const resources: { dispose(): void }[] = [];
  let disposed = false;
  const cleanup = (hasPrimary = false, primary?: unknown) => {
    const errors: unknown[] = hasPrimary ? [primary] : [];
    for (const resource of resources.splice(0).reverse()) try { resource.dispose(); } catch (error) { errors.push(error); }
    if (errors.length) throw new AggregateError(errors, 'Recovery feature original/cleanup causes');
  };
  try {
    const recovery = createVehicleRecovery(options.context, {
      physics: options.physics, controller: options.controller, authority: options.authority,
      damage: options.damage, eventBus: options.eventBus,
      road: createRecoveryRoadProvider(options.graph),
      segments: createRecoverySegmentBoundary(options.context, options.segment),
      clearAddressedInput: options.clearAddressedInput,
    });
    resources.push(recovery);
    const input = bindRecoveryInput({ surface: options.surface, bindings: options.bindings,
      authority: options.authority, port: recovery, enabled: options.enabled }); resources.push(input);
    const hud = createRecoveryHud({ container: options.container,
      read: recovery.readProjection, click: input.click }); resources.push(hud);
    return Object.freeze({
      register: (identity: BodyIdentity, access: RoadAccess) => recovery.register(identity, access),
      remove: recovery.remove,
      /**R queued between ticks commits at the LAST accepted boundary, before next024.step. */
      beforePhysicsTick() { if (disposed) throw new Error('Recovery feature disposed'); input.sync();
        return recovery.commit(options.controller.getStats().tick); },
      afterPhysicsTick(at: number) { if (disposed) throw new Error('Recovery feature disposed'); recovery.observe(at); },
      /**Root schedules this at10Hz; no timer belongs to030. */
      syncHud() { if (disposed) return; input.sync(); hud.sync(); },
      remap: input.remap,
      retryDelivery: recovery.retryDelivery,
      readHistory: recovery.readHistory,
      getStats: () => Object.freeze({ disposed, recovery: recovery.getStats(), input: input.getStats(), hud: hud.getStats() }),
      dispose() { if (disposed) return; disposed = true; cleanup(); },
    });
  } catch (primary) { cleanup(true, primary); throw primary; }
}
