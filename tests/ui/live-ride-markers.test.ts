import assert from 'node:assert/strict';
import test from 'node:test';
import { createLiveRideMarkerLayer, createPassengerVisualPresenter } from '../../src/ui';
import { createHudDocument, type HudElement } from './hud-dom';

function camera(overrides: Record<string, unknown> = {}) {
  return Object.freeze({
    positionM: { x: 0, y: 2, z: -10 },
    lookAtM: { x: 0, y: 1.2, z: 0 },
    up: { x: 0, y: 1, z: 0 },
    fovRadians: 1,
    widthPx: 800,
    heightPx: 600,
    ...overrides,
  });
}

test('265 world markers project the real anchor and hide a marker behind the camera', () => {
  const doc = createHudDocument(),
    host = doc.createElement('div'),
    layer = createLiveRideMarkerLayer(host as unknown as HTMLElement);
  try {
    const presenter = createPassengerVisualPresenter(layer.port);
    const frame = Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      version: '147-passenger-visual-v1' as const,
      sessionId: 'test:265',
      worldEpoch: 1,
      tick: 120,
      taxiId: 'taxi-1',
      rideId: 'ride-1',
      phase: 'ONBOARD' as const,
      occupancy: 1 as const,
      passengerVisible: true,
      markers: Object.freeze([
        Object.freeze({
          markerId: 'passenger:ride-1:DROPOFF',
          role: 'DROPOFF' as const,
          zoneId: 'sz:1-1',
          x: 0,
          z: 0,
          label: 'D' as const,
        }),
      ]),
      omissions: Object.freeze([]),
      labels: Object.freeze({
        phase: 'La bord',
        occupancy: '1 pasager',
        passenger: 'Pasager la bord',
      }),
      accessibleText: '1 pasager la bord.',
      reset: false,
    });
    assert.equal(presenter.update(frame), true);
    assert.equal(layer.getStats().markers, 1);
    assert.equal(layer.getStats().passengerVisible, true);
    const marker = (host as unknown as HudElement).children[0]!.children[0]!;
    assert.equal(marker.getAttribute('data-role'), 'DROPOFF');
    assert.equal(marker.getAttribute('data-visible'), 'false');
    assert.equal(marker.getAttribute('aria-label'), 'D — predare · sz:1-1');

    layer.project(camera());
    assert.equal(marker.getAttribute('data-visible'), 'true');
    assert.equal(layer.getStats().projected, 1);
    assert.match(marker.style.transform ?? '', /400\.0px, 300\.0px/);

    layer.project(camera({ lookAtM: { x: 0, y: 1, z: -20 } }));
    assert.equal(marker.getAttribute('data-visible'), 'false');
    assert.equal(layer.getStats().hidden, 1);

    layer.project(camera({ positionM: { x: 0, y: 2, z: -10 }, fovRadians: 1 }));
    assert.equal(marker.getAttribute('data-visible'), 'true');
    presenter.dispose();
    assert.equal(
      layer.getStats().markers,
      0,
      'the 147 presenter clears its own markers on disposal',
    );
    assert.equal((host as unknown as HudElement).children[0]!.hidden, true);
  } finally {
    layer.dispose();
    assert.equal((host as unknown as HudElement).children.length, 0);
  }
});
