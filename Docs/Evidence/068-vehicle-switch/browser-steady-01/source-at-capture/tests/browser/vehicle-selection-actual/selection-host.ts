import {
  createVehicleSelection,
  type VehicleSelectionPorts,
} from '../../../src/input/vehicle-selection';
import type { ContractContext } from '../../../src/sessions';
import type { BodyIdentity } from '../../../src/vehicles/body-port';
import type { ControlAuthority } from '../../../src/input/control-authority';
import type {
  VehicleSelectionKind,
  VehicleSelectionSource,
} from '../../../src/input/vehicle-selection';

/** Browser host seam only. Actual camera/picker/segment owners remain injected and observable. */
export function actualSelectionHost(
  context: ContractContext,
  identities: readonly BodyIdentity[],
  kinds: readonly VehicleSelectionKind[],
  ports: VehicleSelectionPorts,
) {
  const selection = createVehicleSelection(context, ports);
  // Caller must own selection.dispose immediately after construction, before registration can throw.
  return {
    selection,
    register() {
      if (identities.length !== kinds.length || identities.length > 110)
        throw Error('Selection host admission capacity');
      identities.forEach((identity, index) => selection.register(identity, kinds[index]!));
    },
    prepare(tick: number, identity: BodyIdentity, source: VehicleSelectionSource) {
      if (!selection.enqueue(identity, source)) throw Error('Actual068 admission rejected');
      const ticket = selection.prepare({
        ...context,
        version: '068-vehicle-selection-v1',
        tick,
        dtSeconds: 1 / 60,
      });
      if (!ticket) throw Error('Actual068 ticket unavailable on active tick');
      return ticket;
    },
    settle(
      ticket: Parameters<typeof selection.settle>[0],
      actual: ReturnType<ControlAuthority['getStats']>,
    ) {
      if (actual.tick !== ticket.tick) throw Error('Host did not apply exact066 ticket tick');
      const disposition = selection.settle(ticket);
      if (disposition !== 'ACCEPTED') throw Error('Actual068 settlement ' + disposition);
      const view = selection.observe();
      if (view.tick !== actual.tick || view.fault || view.selectedIdentity !== ticket.identity)
        throw Error('Actual accepted068 projection mismatch');
      return view;
    },
  };
}
