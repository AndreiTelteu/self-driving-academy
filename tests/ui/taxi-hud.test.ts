import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { readTaxiHudSnapshot } from '../../src/app';
import {
  createTaxiHud,
  formatDistanceM,
  formatDuration,
  formatEtaRange,
  formatSpeedKmh,
  modeView,
  projectTaxiHud,
  rideStageView,
  TAXI_HUD_LIMITS,
  TAXI_HUD_VERSION,
} from '../../src/ui';
import type { TaxiHudEta, TaxiHudRide, TaxiHudSnapshot, TaxiHudTaxi } from '../../src/ui';
import { createEtaWorld, disposeEtaWorld, etaObservation, rideOf } from '../fleet/eta-fixture';
import { runTaxiHudReport } from '../app/taxi-hud-report';
import { createHudDocument, createHudHost, findHudElement, serializeHud } from './hud-dom';

const TAXI: TaxiHudTaxi = Object.freeze({
  vehicleId: 'taxi:073:A',
  slot: 7,
  classId: 'sedan',
  profileId: 'style:073',
  profileVersion: 'style-v2',
});

function eta(overrides: Partial<TaxiHudEta> = {}): TaxiHudEta {
  return Object.freeze({
    status: 'ESTIMATED',
    reason: null,
    serviceState: 'FREE_FLOW',
    seconds: 90,
    minSeconds: 80,
    maxSeconds: 100,
    remainingDistanceM: 320,
    progressFraction: 0.42,
    ...overrides,
  });
}

function taxi(overrides: Partial<TaxiHudTaxi> = {}): TaxiHudTaxi {
  return Object.freeze({ ...TAXI, ...overrides });
}

function ride(overrides: Partial<TaxiHudRide> = {}): TaxiHudRide {
  return Object.freeze({
    rideId: 'ride:073',
    taxiId: TAXI.vehicleId,
    state: 'TO_PICKUP',
    pickupZoneId: 'zone:pickup',
    dropoffZoneId: 'zone:dropoff',
    eta: eta(),
    ...overrides,
  });
}

function snapshot(overrides: Partial<TaxiHudSnapshot> = {}): TaxiHudSnapshot {
  return Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    sessionId: 'session:073',
    worldEpoch: 0,
    version: TAXI_HUD_VERSION,
    tick: 10,
    speedMps: 0,
    mode: 'AUTO' as const,
    taxi: taxi(),
    ride: ride(),
    ...overrides,
  });
}

function render(snapshotValue: TaxiHudSnapshot, nowMs = 0) {
  const doc = createHudDocument(),
    host = createHudHost(doc),
    hud = createTaxiHud(host as unknown as HTMLElement);
  hud.update(snapshotValue, nowMs);
  const root = host.children[0]!,
    details = findHudElement(root, 'details');
  if (!details) throw new Error('Details are missing');
  return { host, hud, root, details };
}

function rideValue(root: ReturnType<typeof render>['root'], row: number): string {
  return root.children[3]!.children[row * 2 + 1]!.textContent;
}

function detailValue(details: ReturnType<typeof render>['details'], row: number): string {
  return details.children[1]!.children[row * 2 + 1]!.textContent;
}

function completeRide(
  world: ReturnType<typeof createEtaWorld>,
  rideId: string,
  eventIdPrefix = 'hud',
): void {
  for (const [event, atTick] of [
    ['ARRIVED_PICKUP', 12],
    ['PICKUP_COMPLETE', 13],
    ['ARRIVED_DROPOFF', 14],
    ['DROPOFF_COMPLETE', 15],
  ] as const)
    world.rideWorld.lifecycle.apply({
      rideId,
      eventId: `${eventIdPrefix}:${event}`,
      event,
      tick: atTick,
    });
}

test('073 speed uses m/s input and a single km/h unit with deterministic rounding', () => {
  assert.deepEqual(formatSpeedKmh(0), {
    value: '0',
    unit: 'km/h',
    kmh: 0,
    accessible: 'Viteză: 0 kilometri pe oră',
  });
  assert.equal(formatSpeedKmh(10).value, '36');
  assert.equal(formatSpeedKmh(13.8888888889).value, '50');
  assert.equal(formatSpeedKmh(0.5).value, '2');
  assert.equal(formatSpeedKmh(1 / 3.6).value, '1');
  for (const invalid of [null, undefined, NaN, Infinity, -1]) {
    const view = formatSpeedKmh(invalid);
    assert.equal(view.value, '—', String(invalid));
    assert.equal(view.kmh, null);
    assert.equal(view.unit, 'km/h');
    assert.equal(view.accessible, 'Viteză indisponibilă');
  }
  assert.equal(formatDistanceM(0), '0 m');
  assert.equal(formatDistanceM(999.4), '999 m');
  assert.equal(formatDistanceM(1000), '1.0 km');
  assert.equal(formatDistanceM(1234.5), '1.2 km');
  assert.equal(formatDistanceM(null), '—');
});

test('073 duration and ETA range formats are exact, and unavailable is never 0 s', () => {
  assert.equal(formatDuration(0), '0 s');
  assert.equal(formatDuration(59.4), '59 s');
  assert.equal(formatDuration(59.6), '1 min');
  assert.equal(formatDuration(60), '1 min');
  assert.equal(formatDuration(90), '1 min 30 s');
  assert.equal(formatDuration(125.4), '2 min 05 s');
  assert.equal(formatDuration(null), '—');
  assert.equal(formatDuration(-1), '—');
  assert.equal(formatEtaRange(55, 65), '55 s – 1 min 05 s');
  assert.equal(formatEtaRange(90, 90), '1 min 30 s');
  assert.equal(formatEtaRange(null, 90), '—');
  const unavailable = projectTaxiHud(
    snapshot({
      ride: ride({
        eta: eta({
          status: 'UNAVAILABLE',
          reason: 'SERVICE_BLOCKED',
          serviceState: 'BLOCKED',
          seconds: null,
          minSeconds: null,
          maxSeconds: null,
          remainingDistanceM: null,
          progressFraction: null,
        }),
      }),
    }),
  );
  assert.equal(unavailable.eta, 'Indisponibil');
  assert.equal(unavailable.service, 'Serviciu blocat');
  assert.notEqual(unavailable.eta, '0 s');
  const arrivedPickup = projectTaxiHud(
    snapshot({
      ride: ride({
        state: 'PICKUP',
        eta: eta({
          status: 'ARRIVED',
          seconds: 0,
          minSeconds: 0,
          maxSeconds: 0,
          remainingDistanceM: 0,
          progressFraction: 1,
        }),
      }),
    }),
  );
  assert.equal(arrivedPickup.eta, 'La pasager');
  assert.equal(arrivedPickup.etaAccessible, 'ETA: la pasager');
  assert.equal(arrivedPickup.progress, '100% · 0 m');
  const arrivedDropoff = projectTaxiHud(
    snapshot({
      ride: ride({
        state: 'DROPOFF',
        eta: eta({
          status: 'ARRIVED',
          seconds: 0,
          minSeconds: 0,
          maxSeconds: 0,
          remainingDistanceM: 0,
          progressFraction: 1,
        }),
      }),
    }),
  );
  assert.equal(arrivedDropoff.eta, 'La destinație');
});

test('073 mode labels carry mandated text and a distinct symbol, never colour alone', () => {
  assert.deepEqual(modeView('AUTO'), { symbol: 'A', label: 'Conduce AI-ul' });
  assert.deepEqual(modeView('MANUAL'), { symbol: 'M', label: 'Conduci · învățare oprită' });
  assert.deepEqual(modeView('LEARNING'), { symbol: 'L', label: 'Conduci · orașul învață' });
  assert.equal(
    new Set([modeView('AUTO').symbol, modeView('MANUAL').symbol, modeView('LEARNING').symbol]).size,
    3,
  );
  const rendered = render(snapshot({ mode: 'MANUAL' }));
  assert.equal(rendered.root.children[1]!.children[0]!.textContent, 'M');
  assert.equal(rendered.root.children[1]!.children[1]!.textContent, 'Conduci · învățare oprită');
  assert.equal(rendered.root.getAttribute('data-mode'), 'MANUAL');
  assert.match(rendered.root.getAttribute('aria-label')!, /Conduci · învățare oprită/);
  rendered.hud.dispose();
});

test('073 every real ride stage maps to one player stage and objective', () => {
  assert.deepEqual(rideStageView('TO_PICKUP', 'P', 'D'), {
    stage: 'Spre pasager',
    objective: 'Du-te la pasagerul din P',
    terminal: false,
  });
  assert.deepEqual(rideStageView('PICKUP', 'P', 'D'), {
    stage: 'La pasager',
    objective: 'Așteaptă îmbarcarea în P',
    terminal: false,
  });
  assert.deepEqual(rideStageView('TO_DROPOFF', 'P', 'D'), {
    stage: 'Spre destinație',
    objective: 'Du pasagerul la D',
    terminal: false,
  });
  assert.deepEqual(rideStageView('DROPOFF', 'P', 'D'), {
    stage: 'La destinație',
    objective: 'Finalizează coborârea în D',
    terminal: false,
  });
  for (const [state, stage] of [
    ['COMPLETED', 'Cursă încheiată'],
    ['FAILED', 'Cursă eșuată'],
    ['CANCELLED', 'Cursă anulată'],
  ] as const) {
    const view = rideStageView(state, 'P', 'D');
    assert.equal(view.stage, stage);
    assert.equal(view.objective, 'Fără obiectiv');
    assert.equal(view.terminal, true);
  }
});

test('073 real 057/061/064 binding drives taxi, profile, stage, speed, ETA and progress', () => {
  const world = createEtaWorld();
  try {
    const rideRecord = rideOf(world),
      registry = world.rideWorld.dispatcherWorld.registry,
      vehicle = registry.get(rideRecord.taxiId);
    assert.ok(vehicle);
    registry.updateState(rideRecord.taxiId, { tick: 10, appliedProfileVersion: 'style-v9' });
    const estimate = world.eta.observe(etaObservation(world, { speedMps: 12.5 })),
      view = readTaxiHudSnapshot(
        { fleet: registry, lifecycle: world.rideWorld.lifecycle, eta: world.eta },
        { taxiId: rideRecord.taxiId, mode: 'AUTO', tick: 10, speedMps: 12.5 },
      );
    assert.equal(view.taxi?.vehicleId, rideRecord.taxiId);
    assert.equal(view.taxi?.slot, vehicle.slot);
    assert.equal(view.taxi?.classId, vehicle.classId);
    assert.equal(view.taxi?.profileId, vehicle.profileId);
    assert.equal(view.taxi?.profileVersion, 'style-v9');
    assert.equal(view.ride?.rideId, rideRecord.rideId);
    assert.equal(view.ride?.state, rideRecord.state);
    assert.equal(view.ride?.pickupZoneId, rideRecord.pickupZoneId);
    assert.equal(view.ride?.dropoffZoneId, rideRecord.dropoffZoneId);
    assert.equal(view.ride?.eta.status, 'ESTIMATED');
    assert.equal(view.ride?.eta.seconds, estimate.etaSeconds);

    const p = projectTaxiHud(view);
    assert.equal(p.speed.value, '45');
    assert.equal(p.speed.unit, 'km/h');
    assert.equal(p.route, `${rideRecord.pickupZoneId} → ${rideRecord.dropoffZoneId}`);
    assert.equal(p.stage, 'Spre pasager');
    assert.equal(p.objective, `Du-te la pasagerul din ${rideRecord.pickupZoneId}`);
    assert.equal(p.eta, `~${formatDuration(estimate.etaSeconds)}`);
    assert.equal(
      p.progress,
      `${Math.round((estimate.progressFraction ?? 0) * 100)}% · ${formatDistanceM(estimate.remainingDistanceM)}`,
    );
    assert.equal(p.details[2]!.value, vehicle.profileId);
    assert.equal(p.details[3]!.value, 'style-v9');
    assert.equal(p.details[4]!.value, rideRecord.rideId);
    assert.equal(p.details[5]!.value, rideRecord.state);

    const rendered = render(view);
    assert.equal(rendered.root.children[0]!.children[1]!.textContent, '45');
    assert.equal(rendered.root.children[0]!.children[2]!.textContent, 'km/h');
    assert.equal(
      rendered.root.children[0]!.children[1]!.getAttribute('aria-label'),
      'Viteză: 45 kilometri pe oră',
    );
    assert.equal(rendered.root.children[1]!.children[1]!.textContent, 'Conduce AI-ul');
    assert.equal(rendered.root.children[2]!.children[1]!.textContent, `#${vehicle.slot}`);
    assert.equal(rideValue(rendered.root, 0), 'Spre pasager');
    assert.equal(rideValue(rendered.root, 2), p.route);
    assert.equal(rideValue(rendered.root, 3), p.eta);
    assert.equal(rideValue(rendered.root, 4), p.progress);
    assert.equal(rendered.details.open, false, 'profile identity is available on request only');
    assert.equal(detailValue(rendered.details, 0), rideRecord.taxiId);
    assert.equal(detailValue(rendered.details, 2), vehicle.profileId);
    assert.equal(detailValue(rendered.details, 3), 'style-v9');
    assert.match(serializeHud(rendered.root), /Versiune profil/);
    rendered.hud.dispose();
  } finally {
    disposeEtaWorld(world);
  }
});

test('073 a taxi without a ride shows explicit empty state and never a fake completion', () => {
  const world = createEtaWorld();
  try {
    const rideRecord = rideOf(world),
      registry = world.rideWorld.dispatcherWorld.registry,
      other = registry
        .list()
        .find(
          (vehicle) => vehicle.driverKind === 'TAXI' && vehicle.vehicleId !== rideRecord.taxiId,
        );
    assert.ok(other);
    const view = readTaxiHudSnapshot(
      { fleet: registry, lifecycle: world.rideWorld.lifecycle, eta: world.eta },
      { taxiId: other.vehicleId, mode: 'AUTO', tick: 10, speedMps: 0 },
    );
    assert.equal(view.ride, null);
    const p = projectTaxiHud(view);
    assert.equal(p.stage, 'Nicio cursă activă');
    assert.equal(p.objective, 'Fără obiectiv');
    assert.equal(p.route, 'Fără rută');
    assert.equal(p.eta, 'Fără estimare');
    assert.equal(p.progress, '—');
    assert.equal(p.terminal, false);
    const rendered = render(view);
    assert.equal(rendered.root.children[0]!.children[1]!.textContent, '0');
    assert.equal(rideValue(rendered.root, 0), 'Nicio cursă activă');
    assert.equal(rideValue(rendered.root, 3), 'Fără estimare');
    assert.equal(detailValue(rendered.details, 4), '—');
    const html = serializeHud(rendered.root);
    assert.doesNotMatch(html, /Cursă încheiată/);
    assert.doesNotMatch(html, /0 s/);
    const empty = projectTaxiHud(snapshot({ taxi: null, ride: null, speedMps: null }));
    assert.equal(empty.taxi, 'Niciun taxi selectat');
    assert.equal(empty.speed.value, '—');
    assert.equal(empty.eta, 'Fără estimare');
    const emptyRender = render(snapshot({ taxi: null, ride: null, speedMps: null }));
    assert.equal(emptyRender.root.children[2]!.children[1]!.textContent, 'Niciun taxi selectat');
    emptyRender.hud.dispose();
    rendered.hud.dispose();
  } finally {
    disposeEtaWorld(world);
  }
});

test('073 a taxi change drops the old ride and a mode change is never stale', () => {
  const world = createEtaWorld();
  try {
    const rideRecord = rideOf(world),
      registry = world.rideWorld.dispatcherWorld.registry;
    world.eta.observe(etaObservation(world));
    const sources = { fleet: registry, lifecycle: world.rideWorld.lifecycle, eta: world.eta },
      other = registry
        .list()
        .find(
          (vehicle) => vehicle.driverKind === 'TAXI' && vehicle.vehicleId !== rideRecord.taxiId,
        );
    assert.ok(other);
    const first = readTaxiHudSnapshot(sources, {
        taxiId: rideRecord.taxiId,
        mode: 'AUTO',
        tick: 10,
        speedMps: 8,
      }),
      rendered = render(first);
    assert.equal(rideValue(rendered.root, 0), 'Spre pasager');
    assert.equal(detailValue(rendered.details, 4), rideRecord.rideId);
    const writes = rendered.hud.getStats().writes as number,
      second = readTaxiHudSnapshot(sources, {
        taxiId: other.vehicleId,
        mode: 'AUTO',
        tick: 11,
        speedMps: 3,
      });
    rendered.hud.update(second, 10);
    assert.equal(rendered.root.children[2]!.children[1]!.textContent, `#${other.slot}`);
    assert.equal(rideValue(rendered.root, 0), 'Nicio cursă activă');
    assert.equal(rideValue(rendered.root, 3), 'Fără estimare');
    assert.equal(detailValue(rendered.details, 4), '—');
    const third = { ...second, mode: 'MANUAL' as const, tick: 12 };
    rendered.hud.update(third, 20);
    assert.equal(rendered.root.children[1]!.children[1]!.textContent, 'Conduci · învățare oprită');
    const afterChanges = rendered.hud.getStats().writes as number;
    assert.ok(afterChanges > writes);
    rendered.hud.update({ ...third, tick: 13 }, 30);
    assert.equal(rendered.hud.getStats().writes, afterChanges);
    assert.ok((rendered.hud.getStats().skipped as number) >= 1);
    rendered.hud.dispose();
  } finally {
    disposeEtaWorld(world);
  }
});

test('073 a ride claimed by another taxi is explicit and hides its ETA', () => {
  const foreign = snapshot({
    taxi: taxi({ vehicleId: 'taxi:073:B' }),
    ride: ride({ taxiId: 'taxi:073:A', eta: eta() }),
  });
  const p = projectTaxiHud(foreign);
  assert.equal(p.foreign, true);
  assert.equal(p.stage, 'Cursă a altui taxi');
  assert.equal(p.eta, 'Fără estimare');
  assert.equal(p.progress, '—');
  const rendered = render(foreign);
  assert.equal(rideValue(rendered.root, 0), 'Cursă a altui taxi');
  assert.equal(rideValue(rendered.root, 3), 'Fără estimare');
  assert.equal(rendered.root.getAttribute('data-stance'), 'FOREIGN');
  rendered.hud.dispose();
});

test('073 a real completed ride is terminal and carries no active ETA', () => {
  const world = createEtaWorld();
  try {
    const rideRecord = rideOf(world),
      registry = world.rideWorld.dispatcherWorld.registry;
    world.eta.observe(etaObservation(world));
    completeRide(world, rideRecord.rideId);
    const view = readTaxiHudSnapshot(
      { fleet: registry, lifecycle: world.rideWorld.lifecycle, eta: world.eta },
      {
        taxiId: rideRecord.taxiId,
        mode: 'AUTO',
        tick: world.rideWorld.lifecycle.currentTick(),
        speedMps: 0,
        rideId: rideRecord.rideId,
      },
    );
    assert.equal(view.ride?.state, 'COMPLETED');
    assert.equal(view.ride?.eta.status, 'NOT_OBSERVED');
    const p = projectTaxiHud(view);
    assert.equal(p.terminal, true);
    assert.equal(p.stage, 'Cursă încheiată');
    assert.equal(p.objective, 'Fără obiectiv');
    assert.equal(p.eta, '—');
    assert.equal(p.progress, '100% · 0 m');
    assert.equal(p.details[5]!.value, 'COMPLETED');
    const rendered = render(view);
    assert.equal(rideValue(rendered.root, 0), 'Cursă încheiată');
    assert.equal(rideValue(rendered.root, 3), '—');
    assert.doesNotMatch(serializeHud(rendered.root), /~0 s/);
    rendered.hud.dispose();
  } finally {
    disposeEtaWorld(world);
  }
});

test('073 a BLOCKED service is explicit and never becomes a zero-second ETA', () => {
  const world = createEtaWorld();
  try {
    const rideRecord = rideOf(world),
      registry = world.rideWorld.dispatcherWorld.registry;
    world.eta.observe(etaObservation(world));
    world.eta.setServiceState('BLOCKED');
    const estimate = world.eta.observe(etaObservation(world, { tick: 11, speedMps: 5 }));
    assert.equal(estimate.reason, 'SERVICE_BLOCKED');
    const view = readTaxiHudSnapshot(
        { fleet: registry, lifecycle: world.rideWorld.lifecycle, eta: world.eta },
        { taxiId: rideRecord.taxiId, mode: 'AUTO', tick: 11, speedMps: 5 },
      ),
      p = projectTaxiHud(view);
    assert.equal(p.eta, 'Indisponibil');
    assert.equal(p.service, 'Serviciu blocat');
    assert.equal(p.details[8]!.value, 'SERVICE_BLOCKED');
    assert.notEqual(p.eta, '0 s');
    const rendered = render(view);
    assert.equal(rendered.root.getAttribute('data-service'), 'BLOCKED');
    assert.equal(rideValue(rendered.root, 3), 'Indisponibil');
    assert.equal(rideValue(rendered.root, 5), 'Serviciu blocat');
    rendered.hud.dispose();
  } finally {
    disposeEtaWorld(world);
  }
});

test('073 malformed and stale frames are rejected; lifecycle is bounded', () => {
  const rendered = render(snapshot());
  assert.equal(rendered.hud.getStats().elements, TAXI_HUD_LIMITS.elements);
  assert.equal(rendered.hud.getStats().textNodes, TAXI_HUD_LIMITS.textNodes);
  assert.throws(() => rendered.hud.update(snapshot({ tick: 9 }), 10), /Stale/);
  assert.throws(
    () => rendered.hud.update(snapshot({ mode: 'BROKEN' as TaxiHudSnapshot['mode'] }), 10),
    /mode/,
  );
  assert.throws(() => rendered.hud.update(snapshot({ speedMps: NaN }), 10), /speed/);
  rendered.hud.update(snapshot({ tick: 11 }), 10);
  assert.throws(() => rendered.hud.update(snapshot({ tick: 12 }), 9), /clock/);
  for (let index = 0; index < 20; index += 1) {
    const local = render(snapshot());
    local.hud.dispose();
    local.hud.dispose();
    assert.equal(local.host.children.length, 0);
    assert.equal(local.hud.getStats().elements, 0);
    assert.equal(local.hud.getStats().textNodes, 0);
    assert.equal(local.hud.getStats().listeners, 0);
    assert.equal(local.hud.getStats().retainedProjections, 0);
  }
  rendered.hud.dispose();
});

test('073 committed evidence report is the current deterministic transcript', () => {
  const report = runTaxiHudReport(),
    saved = readFileSync(join(process.cwd(), 'Docs', 'Evidence', '073-hud', 'report.json'), 'utf8');
  assert.equal(report.summary.pass, true);
  assert.equal(saved, `${JSON.stringify(report, null, 2)}\n`);
});
