import { parseVehicleCommand } from '../../src/vehicles/contracts';
import type { ControlMode, VehicleCommand } from '../../src/vehicles/contracts';

export const CONTROLLER_CONTEXT = Object.freeze({
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: 'controller-024-fixture',
  worldEpoch: 0,
});

export function controllerCommand(
  vehicleId: string,
  tick: number,
  source: VehicleCommand['source'],
  values: Partial<
    Pick<VehicleCommand, 'throttle' | 'brake' | 'steering' | 'handbrake' | 'turnSignal'>
  > = {},
): VehicleCommand {
  return parseVehicleCommand({
    ...CONTROLLER_CONTEXT,
    vehicleId,
    tick,
    source,
    throttle: 0,
    brake: 0,
    steering: 0,
    handbrake: false,
    turnSignal: 'OFF',
    ...values,
  });
}

/** Exhaustive per-tick test oracle. No retention, ports, authority mutation or physics. */
export function referenceCommandSelection(
  mode: ControlMode,
  vehicleId: string,
  tick: number,
  packets: readonly unknown[],
) {
  const source = mode === 'AUTO' ? 'AUTONOMY' : 'PLAYER';
  const commands = packets.map(parseVehicleCommand);
  for (const command of commands) {
    if (
      command.sessionId !== CONTROLLER_CONTEXT.sessionId ||
      command.worldEpoch !== CONTROLLER_CONTEXT.worldEpoch ||
      command.vehicleId !== vehicleId ||
      command.tick !== tick
    )
      throw new Error('Reference packet addressing');
  }
  for (const candidate of ['AUTONOMY', 'PLAYER'] as const) {
    if (commands.filter((command) => command.source === candidate).length > 1)
      throw new Error('Reference duplicate source');
  }
  const raw =
    commands.find((command) => command.source === source) ??
    controllerCommand(vehicleId, tick, source);
  const effective = Object.freeze({
    ...raw,
    throttle: raw.brake > 0 || raw.handbrake ? 0 : raw.throttle,
  });
  return Object.freeze({
    raw,
    effective,
    ignored: Object.freeze(commands.filter((command) => command.source !== source)),
  });
}
