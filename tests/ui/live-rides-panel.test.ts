import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  LiveRideAssignmentView,
  LiveRideRequestView,
  LiveRideSnapshot,
} from '../../src/fleet';
import { LIVE_RIDES_PANEL_VERSION, createLiveRidesPanel } from '../../src/ui';
import { createHudDocument, type HudElement } from './hud-dom';

function assignment(): LiveRideAssignmentView {
  return Object.freeze({
    assignmentId: 'assignment-1',
    requestId: 'request-1',
    taxiId: 'taxi-1',
    tick: 120,
    pickupZoneId: 'sz:0-0',
    dropoffZoneId: 'sz:1-1',
    pickupCostSeconds: 12.5,
    tripCostSeconds: 44.25,
    totalCostSeconds: 56.75,
    pickupRouteLaneIds: Object.freeze(['lane:00N0', 'lane:01E0']),
    tripRouteLaneIds: Object.freeze(['lane:01E0', 'lane:11E0']),
    graphVersion: '033-lane-graph-v1',
    costVersion: 'route-cost-v1',
    taxiSlot: 3,
  });
}

function snapshot(tick: number, state: 'PENDING' | 'ASSIGNED' = 'ASSIGNED'): LiveRideSnapshot {
  const active = state === 'ASSIGNED',
    rows: LiveRideRequestView[] = [
      {
        requestId: 'request-1',
        windowId: 'w000',
        ordinal: 0,
        spawnTick: 60,
        demandLevel: 'HIGH',
        originZoneId: 'sz:0-0',
        destinationZoneId: 'sz:1-1',
        state,
        validationStatus: 'READY',
        taxiId: active ? 'taxi-1' : null,
        taxiSlot: active ? 3 : null,
        assignmentId: active ? 'assignment-1' : null,
        pickupCostSeconds: active ? 12.5 : null,
        tripCostSeconds: active ? 44.25 : null,
        releaseCause: null,
      },
      {
        requestId: 'request-2',
        windowId: 'w000',
        ordinal: 1,
        spawnTick: 60,
        demandLevel: 'HIGH',
        originZoneId: 'sz:2-0',
        destinationZoneId: 'sz:0-1',
        state: 'PENDING' as const,
        validationStatus: 'READY',
        taxiId: null,
        taxiSlot: null,
        assignmentId: null,
        pickupCostSeconds: null,
        tripCostSeconds: null,
        releaseCause: null,
      },
    ];
  return Object.freeze({
    version: '264-live-rides-v1',
    tick,
    namespace: 'test:264:rides',
    scenarioId: 'test-264',
    counts: Object.freeze({
      windows: 1,
      requests: 2,
      valid: 2,
      invalid: 0,
      pending: 1,
      assigned: active ? 1 : 0,
      availableTaxis: active ? 23 : 24,
      excludedPlayer: 0,
      blockedTaxis: 0,
      damagedTaxis: 0,
      offlineTaxis: 0,
      taxis: 24,
    }),
    totals: Object.freeze({
      admitted: 2,
      dequeued: active ? 1 : 0,
      overflow: 0,
      assignments: active ? 1 : 0,
      releases: 0,
      rejected: 0,
      dispatchSteps: 1,
      routeSearches: 25,
      lastSearches: 25,
      maxSearchesPerStep: 25,
      maxAssignmentsPerStep: 1,
      releasesByCause: Object.freeze({
        PLAYER_TAKEOVER: 0,
        BLOCKED: 0,
        DAMAGED: 0,
        OFFLINE: 0,
        SCENARIO_RESET: 0,
      }),
    }),
    queue: Object.freeze({
      limit: 64,
      pending: 1,
      admitted: 2,
      overflow: 0,
      policy: 'REJECT_NEWEST',
      dispatchEveryTicks: 6,
      assignmentsPerDispatch: 2,
      routeSearchBudget: 128,
    }),
    requests: Object.freeze(rows),
    assignments: Object.freeze(active ? [assignment()] : []),
    releases: Object.freeze([]),
    rejections: Object.freeze([]),
    disposed: false,
  });
}

test('264 live rides panel renders the real queue and active claims from the read model', () => {
  const doc = createHudDocument(),
    host = doc.createElement('div'),
    clock = { value: 0 };
  let closed = 0;
  const panel = createLiveRidesPanel(host as unknown as HTMLElement, {
    onClose: () => {
      closed += 1;
    },
    now: () => clock.value,
    style: false,
  });
  try {
    assert.equal(panel.root.hidden, true);
    panel.open();
    assert.equal(panel.root.hidden, false);
    assert.equal(panel.root.getAttribute('role'), 'dialog');
    assert.equal(panel.root.getAttribute('aria-modal'), 'true');
    panel.update(snapshot(120), 0);
    assert.equal(panel.getStats().requests, 2);
    assert.equal(panel.getStats().assignments, 1);
    const text = panel.root.textContent;
    assert.match(text, /2 în coadă|1 în coadă/);
    assert.match(text, /alocate/);
    assert.match(text, /Taxi #3/);
    assert.match(text, /sz:0-0 → sz:1-1/);
    assert.match(text, /alocată/);
    assert.match(text, /în coadă/);
    assert.match(text, /25\/128/);
    // 10 Hz ceiling: an early call is skipped, the next one writes.
    const updates = panel.getStats().updates;
    panel.update(snapshot(121), 50);
    assert.equal(panel.getStats().updates, updates);
    assert.ok(panel.getStats().skipped > 0);
    assert.throws(() => panel.update(snapshot(119, 'PENDING'), 110), /Stale/);
    panel.update(snapshot(122, 'PENDING'), 110);
    assert.ok(panel.getStats().updates > updates);
    assert.equal(panel.getStats().assignments, 0);
    const escape = (panel.root as unknown as HudElement).dispatchEvent('keydown', {
      key: 'Escape',
    });
    assert.equal(escape.defaultPrevented, true);
    assert.equal(closed, 1);
    assert.equal(panel.isOpen(), false);
    assert.equal(panel.root.getAttribute('role'), null);
    assert.equal(panel.getStats().globalListeners, 0);
    panel.open();
    panel.close();
    assert.equal(closed, 2);
  } finally {
    panel.dispose();
    panel.dispose();
    assert.equal(panel.getStats().disposed, true);
    assert.equal(panel.getStats().listeners, 0);
    assert.equal(host.children.length, 0);
  }
});

test('264 live rides panel stays read-only, hidden panels write nothing and disposal is clean', () => {
  const doc = createHudDocument(),
    host = doc.createElement('div');
  const panel = createLiveRidesPanel(host as unknown as HTMLElement, {
    onClose: () => {},
    now: () => 0,
    style: false,
  });
  try {
    panel.update(snapshot(10), 0);
    assert.equal(panel.getStats().updates, 0);
    assert.ok(panel.getStats().skipped > 0);
    panel.open();
    assert.equal(panel.getStats().focusables, 1);
    panel.update(snapshot(10), 0);
    assert.equal(panel.getStats().updates, 1);
    assert.equal(panel.version, LIVE_RIDES_PANEL_VERSION);
  } finally {
    panel.dispose();
    assert.equal(host.children.length, 0);
  }
});
