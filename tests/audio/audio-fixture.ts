import type { VehicleAudioSample } from '../../src/audio';

export interface AudioFixtureVehicle {
  readonly entityId: string;
  readonly sample: VehicleAudioSample;
}

export interface AudioFixture {
  readonly version: string;
  readonly vehicles: readonly AudioFixtureVehicle[];
  readonly taxis: number;
  readonly civilians: number;
}

/**
 * Deterministic fixture of the audio subsystem.
 *
 * The distances follow the audible radius of the engine: a part of the fleet is inside the
 * radius, the rest is out of reach and must not consume the audio work.
 */
export function createAudioFixture(taxis = 30, civilians = 40): AudioFixture {
  const vehicles: AudioFixtureVehicle[] = [];
  const total = taxis + civilians;
  for (let index = 0; index < total; index += 1) {
    const entityId = `vehicle-${index}`;
    vehicles.push(
      Object.freeze({
        entityId,
        sample: Object.freeze({
          entityId,
          speedMps: 4 + (index % 9) * 2,
          loadFactor: (index % 5) / 4,
          brakeFactor: 0,
          slipFactor: 0,
          distanceM: 5 + (index % 12) * 8,
        }),
      }),
    );
  }
  return Object.freeze({
    version: '148-audio-fixture-v1',
    vehicles: Object.freeze(vehicles),
    taxis,
    civilians,
  });
}
