import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  V1_COMPATIBILITY,
  V2_CONTEXT_VERSION,
  V2_CONTROL_SCENARIO_ID,
  evaluateV2ContextScenario,
  v1ParameterKeys,
  v2ContextCatalogValidation,
  v2ContextCategories,
  v2ContextCategoryTitles,
  v2ContextCoverage,
  v2ContextDefinitions,
  v2RepresentativeScenarioIds,
} from '../../src/telemetry';
import type {
  V2ContextCategory,
  V2ContextScenario,
  V2ScenarioEvaluation,
} from '../../src/telemetry';
import {
  obstacle,
  pedestrian,
  resetV2EventSequence,
  v2Event,
  v2Frame,
  v2Route,
  v2Scenario,
  v2Service,
} from './v2-contexts-fixtures';

/**
 * The ten representative V2 scenarios (one per R category) plus the negative control. Frames are
 * declarative data; the evaluation is done by `evaluateV2ContextScenario`, so the report counts what
 * the contracts actually expose instead of restating the intent.
 */

const TAXI = 'taxi-1';

function leaderAcquired(tick: number, leaderId: string, gapM: number) {
  return v2Event(tick, 'LEADER_ACQUIRED', { vehicleId: TAXI, leaderId, gapM }, [TAXI, leaderId]);
}

function signalPhase(
  tick: number,
  fromPhaseId: string,
  toPhaseId: string,
  state: 'RED' | 'YELLOW' | 'GREEN',
) {
  return v2Event(
    tick,
    'SIGNAL_PHASE_CHANGED',
    {
      signalId: 'sig-1',
      intersectionId: 'int-1',
      fromPhaseId,
      toPhaseId,
      movementStates: [{ movementId: 'movement-1', state }],
    },
    ['sig-1'],
  );
}

function stopEvent(
  tick: number,
  type: 'STOP_APPROACH' | 'STOP_LINE_CROSSED',
  opportunityId: string,
  stopLineId: string,
) {
  return v2Event(tick, type, { vehicleId: TAXI, opportunityId, stopLineId }, [TAXI]);
}

function fullStop(tick: number, opportunityId: string, durationS: number) {
  return v2Event(tick, 'FULL_STOP', { vehicleId: TAXI, opportunityId, durationS }, [TAXI]);
}

function laneChange(
  tick: number,
  type: 'LANE_CHANGE_STARTED' | 'LANE_CHANGE_COMPLETED',
  opportunityId: string,
  fromLaneId: string,
  toLaneId: string,
) {
  return v2Event(tick, type, { vehicleId: TAXI, opportunityId, fromLaneId, toLaneId }, [
    TAXI,
    fromLaneId,
    toLaneId,
  ]);
}

function rideEvent(tick: number, type: 'PICKUP' | 'DROPOFF', rideId: string) {
  return v2Event(tick, type, { vehicleId: TAXI, rideId }, [TAXI]);
}

/** SPEED — croazieră pe arteră, urban și rezidențial, cu o singură depășire de limită. */
function speedScenario(): V2ContextScenario {
  return v2Scenario('speed-arterial-rhythm', 'SPEED', 'Ritm de croazieră pe arteră', [
    v2Frame(100, {
      sample: { roadType: 'URBAN', speedMps: 9, throttle: 0.5, longitudinalAccelerationMps2: 0.4 },
    }),
    v2Frame(160, {
      sample: {
        roadType: 'ARTERIAL',
        speedLimitMps: 16.7,
        speedMps: 10,
        throttle: 0.45,
        longitudinalAccelerationMps2: 0.2,
      },
    }),
    v2Frame(220, {
      sample: {
        roadType: 'ARTERIAL',
        speedLimitMps: 16.7,
        speedMps: 19,
        throttle: 0.8,
        longitudinalAccelerationMps2: 1.2,
      },
    }),
    v2Frame(280, {
      sample: {
        roadType: 'RESIDENTIAL',
        speedLimitMps: 8.3,
        speedMps: 6,
        throttle: 0.3,
        longitudinalAccelerationMps2: 0.1,
      },
    }),
    v2Frame(340, {
      sample: {
        roadType: 'ARTERIAL',
        speedLimitMps: 16.7,
        speedMps: 14,
        throttle: 0.6,
        longitudinalAccelerationMps2: 0.5,
        leaderId: 'civil-9',
        leaderGapM: 22,
      },
      events: [laneChange(340, 'LANE_CHANGE_STARTED', 'lc-speed-1', 'lane-1', 'lane-2')],
    }),
    v2Frame(400, {
      sample: {
        roadType: 'ARTERIAL',
        speedLimitMps: 16.7,
        speedMps: 12,
        throttle: 0,
        brake: 0,
        longitudinalAccelerationMps2: -0.2,
      },
    }),
  ]);
}

/** LONGITUDINAL — accelerare, coasting, frână progresivă și plecare de la linia de oprire. */
function longitudinalScenario(): V2ContextScenario {
  return v2Scenario('longitudinal-coast-brake', 'LONGITUDINAL', 'Coasting și frână progresivă', [
    v2Frame(100, {
      sample: {
        speedMps: 12,
        throttle: 0.7,
        longitudinalAccelerationMps2: 0.8,
        leaderId: 'civil-2',
        leaderGapM: 20,
      },
    }),
    v2Frame(160, {
      sample: {
        speedMps: 11,
        throttle: 0,
        brake: 0,
        longitudinalAccelerationMps2: -0.1,
        leaderId: 'civil-2',
        leaderGapM: 18,
      },
    }),
    v2Frame(220, {
      sample: {
        speedMps: 10.5,
        throttle: 0,
        brake: 0,
        longitudinalAccelerationMps2: -0.2,
        leaderId: 'civil-2',
        leaderGapM: 16,
      },
    }),
    v2Frame(280, {
      sample: {
        speedMps: 8,
        throttle: 0,
        brake: 0.35,
        longitudinalAccelerationMps2: -1.8,
        leaderId: 'civil-2',
        leaderGapM: 12,
      },
    }),
    v2Frame(340, {
      sample: {
        speedMps: 4,
        throttle: 0,
        brake: 0.8,
        longitudinalAccelerationMps2: -3.2,
        leaderId: 'civil-2',
        leaderGapM: 8,
      },
    }),
    v2Frame(400, {
      sample: {
        speedMps: 1,
        throttle: 0.2,
        brake: 0.6,
        longitudinalAccelerationMps2: -0.9,
        stopLineId: 'sl-longitudinal',
        distanceToStopLineM: 2,
        leaderId: 'civil-2',
        leaderGapM: 5,
      },
    }),
  ]);
}

/** FOLLOWING — spațiu în scădere, cut-in, schimbare de lider și coadă oprită. */
function followingScenario(): V2ContextScenario {
  return v2Scenario('following-leader-gap', 'FOLLOWING', 'Urmărire cu schimbare de lider', [
    v2Frame(100, {
      sample: {
        speedMps: 13,
        throttle: 0.5,
        longitudinalAccelerationMps2: 0.1,
        leaderId: 'civil-2',
        leaderGapM: 26,
      },
    }),
    v2Frame(160, {
      sample: {
        speedMps: 12.8,
        throttle: 0.3,
        longitudinalAccelerationMps2: -0.1,
        leaderId: 'civil-2',
        leaderGapM: 22,
      },
    }),
    v2Frame(220, {
      sample: {
        speedMps: 12.5,
        throttle: 0.2,
        longitudinalAccelerationMps2: 0.05,
        leaderId: 'civil-2',
        leaderGapM: 19,
      },
    }),
    v2Frame(280, {
      sample: {
        speedMps: 12,
        throttle: 0,
        brake: 0.1,
        longitudinalAccelerationMps2: -0.6,
        leaderId: 'civil-3',
        leaderGapM: 14,
      },
      events: [leaderAcquired(280, 'civil-3', 14)],
    }),
    v2Frame(340, {
      sample: {
        speedMps: 12,
        throttle: 0.1,
        longitudinalAccelerationMps2: 0.1,
        leaderId: 'civil-3',
        leaderGapM: 13,
      },
    }),
    v2Frame(400, {
      sample: {
        speedMps: 0.05,
        throttle: 0,
        brake: 0.5,
        longitudinalAccelerationMps2: -1.2,
        leaderId: 'civil-4',
        leaderGapM: 2,
      },
      events: [leaderAcquired(400, 'civil-4', 2)],
    }),
  ]);
}

/** SIGNALS — ciclu roșu → verde, galben și conflict pe roșu. */
function signalsScenario(): V2ContextScenario {
  return v2Scenario('signals-red-green-cycle', 'SIGNALS', 'Ciclu complet de semafor', [
    v2Frame(100, {
      sample: {
        speedMps: 0.2,
        throttle: 0,
        brake: 0.4,
        longitudinalAccelerationMps2: -0.1,
        signalId: 'sig-1',
        signalState: 'RED',
        stopLineId: 'sl-1',
        distanceToStopLineM: 35,
      },
    }),
    v2Frame(160, {
      sample: {
        speedMps: 0,
        throttle: 0,
        brake: 1,
        longitudinalAccelerationMps2: -0.05,
        signalId: 'sig-1',
        signalState: 'RED',
        stopLineId: 'sl-1',
        distanceToStopLineM: 2,
      },
    }),
    v2Frame(220, {
      sample: {
        speedMps: 0.4,
        throttle: 0.3,
        longitudinalAccelerationMps2: 0.8,
        signalId: 'sig-1',
        signalState: 'GREEN',
        stopLineId: 'sl-1',
        distanceToStopLineM: 0.5,
      },
      events: [signalPhase(220, 'phase-red-1', 'phase-green-1', 'GREEN')],
    }),
    v2Frame(280, {
      sample: {
        speedMps: 7,
        throttle: 0.4,
        longitudinalAccelerationMps2: 0.4,
        signalId: 'sig-1',
        signalState: 'GREEN',
        stopLineId: 'sl-1',
        distanceToStopLineM: 8,
      },
    }),
    v2Frame(340, {
      sample: {
        speedMps: 9,
        throttle: 0.5,
        longitudinalAccelerationMps2: 0.2,
        signalId: 'sig-1',
        signalState: 'YELLOW',
        stopLineId: 'sl-1',
        distanceToStopLineM: 12,
      },
    }),
    v2Frame(400, {
      sample: {
        speedMps: 0,
        throttle: 0,
        brake: 0.9,
        longitudinalAccelerationMps2: -0.05,
        signalId: 'sig-1',
        signalState: 'RED',
        stopLineId: 'sl-1',
        distanceToStopLineM: 0.2,
        conflictEntityIds: ['civil-5'],
      },
    }),
  ]);
}

/** STOP_PRIORITY — apropiere STOP, oprire completă, coadă și conflict de prioritate. */
function stopPriorityScenario(): V2ContextScenario {
  return v2Scenario('stop-priority-conflict', 'STOP_PRIORITY', 'STOP cu prioritate și conflict', [
    v2Frame(100, {
      sample: {
        speedMps: 9,
        throttle: 0.4,
        longitudinalAccelerationMps2: 0.2,
        stopLineId: 'sl-2',
        distanceToStopLineM: 25,
        leaderId: 'civil-6',
        leaderGapM: 18,
      },
    }),
    v2Frame(160, {
      sample: {
        speedMps: 4.5,
        throttle: 0,
        brake: 0.5,
        longitudinalAccelerationMps2: -2,
        stopLineId: 'sl-2',
        distanceToStopLineM: 8,
        leaderId: 'civil-6',
        leaderGapM: 6,
      },
      events: [stopEvent(160, 'STOP_APPROACH', 'stop-op-1', 'sl-2')],
    }),
    v2Frame(220, {
      sample: {
        speedMps: 0,
        throttle: 0,
        brake: 1,
        longitudinalAccelerationMps2: -0.1,
        stopLineId: 'sl-2',
        distanceToStopLineM: 2,
        leaderId: 'civil-6',
        leaderGapM: 3,
      },
      events: [fullStop(220, 'stop-op-1', 1.2)],
    }),
    v2Frame(280, {
      sample: {
        speedMps: 0.05,
        throttle: 0,
        brake: 0.8,
        longitudinalAccelerationMps2: -0.02,
        stopLineId: 'sl-2',
        distanceToStopLineM: 1.5,
        leaderId: 'civil-6',
        leaderGapM: 2.5,
      },
    }),
    v2Frame(340, {
      sample: {
        speedMps: 2.5,
        throttle: 0.2,
        brake: 0.2,
        longitudinalAccelerationMps2: 0.8,
        stopLineId: 'sl-2',
        distanceToStopLineM: 0.5,
        conflictEntityIds: ['civil-7'],
      },
      events: [stopEvent(340, 'STOP_LINE_CROSSED', 'stop-op-1', 'sl-2')],
    }),
    v2Frame(400, {
      sample: {
        speedMps: 6,
        throttle: 0.4,
        longitudinalAccelerationMps2: 0.5,
        stopLineId: 'sl-3',
        distanceToStopLineM: 14,
        leaderId: 'civil-7',
        leaderGapM: 12,
        conflictEntityIds: ['civil-7'],
      },
    }),
  ]);
}

/** LANE_CHANGE — semnalizare, manevră completă și depășire prin dreapta. */
function laneChangeScenario(): V2ContextScenario {
  return v2Scenario('lane-change-overtake', 'LANE_CHANGE', 'Depășire cu semnalizare', [
    v2Frame(100, {
      sample: {
        speedMps: 11,
        throttle: 0.5,
        longitudinalAccelerationMps2: 0.2,
        turnSignal: 'LEFT',
        leaderId: 'civil-8',
        leaderGapM: 20,
      },
    }),
    v2Frame(160, {
      sample: {
        speedMps: 11.5,
        throttle: 0.6,
        steering: -0.15,
        longitudinalAccelerationMps2: 0.3,
        turnSignal: 'LEFT',
        leaderId: 'civil-8',
        leaderGapM: 18,
      },
    }),
    v2Frame(220, {
      sample: {
        speedMps: 12,
        throttle: 0.6,
        steering: -0.3,
        longitudinalAccelerationMps2: 0.2,
        turnSignal: 'LEFT',
        leaderId: 'civil-8',
        leaderGapM: 16,
      },
      events: [laneChange(220, 'LANE_CHANGE_STARTED', 'lc-op-1', 'lane-1', 'lane-2')],
    }),
    v2Frame(280, {
      sample: {
        speedMps: 12.5,
        throttle: 0.7,
        steering: -0.05,
        longitudinalAccelerationMps2: 0.4,
        leaderId: 'civil-8',
        leaderGapM: 14,
      },
    }),
    v2Frame(340, {
      sample: {
        speedMps: 13,
        throttle: 0.6,
        longitudinalAccelerationMps2: 0.3,
        leaderId: 'civil-8',
        leaderGapM: 25,
      },
      events: [laneChange(340, 'LANE_CHANGE_COMPLETED', 'lc-op-1', 'lane-1', 'lane-2')],
    }),
    v2Frame(400, {
      sample: {
        speedMps: 13,
        throttle: 0.5,
        longitudinalAccelerationMps2: 0.1,
      },
    }),
  ]);
}

/** LATERAL — urmărire de curbă cu încărcare laterală susținută și vehicul oprit lateral. */
function lateralScenario(): V2ContextScenario {
  return v2Scenario('lateral-curve-tracking', 'LATERAL', 'Urmărire de curbă și clearance lateral', [
    v2Frame(100, {
      sample: {
        speedMps: 12,
        throttle: 0.4,
        steering: 0.1,
        curvaturePerM: 0.004,
        longitudinalAccelerationMps2: 0.1,
        lateralAccelerationMps2: 1.2,
      },
    }),
    v2Frame(160, {
      sample: {
        speedMps: 12,
        throttle: 0.3,
        steering: 0.35,
        curvaturePerM: 0.02,
        longitudinalAccelerationMps2: 0.05,
        lateralAccelerationMps2: 3.4,
      },
    }),
    v2Frame(220, {
      sample: {
        speedMps: 11.5,
        throttle: 0.2,
        steering: 0.4,
        curvaturePerM: 0.03,
        longitudinalAccelerationMps2: -0.1,
        lateralAccelerationMps2: 4.1,
      },
    }),
    v2Frame(280, {
      sample: {
        speedMps: 11.5,
        throttle: 0.35,
        steering: 0.2,
        curvaturePerM: 0.02,
        longitudinalAccelerationMps2: 0.3,
        lateralAccelerationMps2: 2.6,
      },
    }),
    v2Frame(340, {
      sample: {
        speedMps: 12,
        throttle: 0.5,
        steering: -0.05,
        curvaturePerM: 0.01,
        longitudinalAccelerationMps2: 0.6,
        lateralAccelerationMps2: 1.1,
      },
    }),
    v2Frame(400, {
      sample: {
        speedMps: 11,
        throttle: 0.45,
        steering: 0.04,
        curvaturePerM: 0.006,
        longitudinalAccelerationMps2: 0.4,
        lateralAccelerationMps2: 0.6,
        conflictEntityIds: ['civil-9'],
      },
    }),
  ]);
}

/** ROUTING — alternative comparabile, bandă blocată, rerutare, întoarcere și recuperare. */
function routingScenario(): V2ContextScenario {
  return v2Scenario('routing-blocked-reroute', 'ROUTING', 'Rerutare și recuperare', [
    v2Frame(100, {
      sample: {
        speedMps: 10,
        throttle: 0.2,
        longitudinalAccelerationMps2: -0.3,
        signalId: 'sig-4',
        signalState: 'RED',
        stopLineId: 'sl-4',
        distanceToStopLineM: 20,
        conflictEntityIds: ['civil-10'],
      },
      route: v2Route({
        alternatives: 3,
        turnCount: 2,
        signalCount: 3,
        congestedAlternatives: 1,
      }),
    }),
    v2Frame(160, {
      sample: {
        speedMps: 6,
        throttle: 0.2,
        brake: 0.4,
        longitudinalAccelerationMps2: -1,
        signalId: 'sig-4',
        signalState: 'YELLOW',
        stopLineId: 'sl-4',
        distanceToStopLineM: 6,
      },
      route: v2Route({ alternatives: 3, turnCount: 2, signalCount: 3, congestedAlternatives: 1 }),
    }),
    v2Frame(220, {
      sample: {
        speedMps: 2,
        throttle: 0,
        brake: 0.6,
        longitudinalAccelerationMps2: -1.4,
        leaderId: 'civil-11',
        leaderGapM: 4,
      },
      route: v2Route({
        status: 'BLOCKED',
        alternatives: 2,
        selectedIndex: 1,
        blockedLaneIds: ['lane-7'],
        recoveryStage: 'WAITING',
      }),
    }),
    v2Frame(280, {
      sample: {
        speedMps: 1.5,
        throttle: 0,
        brake: 0.5,
        longitudinalAccelerationMps2: -0.8,
      },
      route: v2Route({
        status: 'BLOCKED',
        alternatives: 2,
        selectedIndex: 1,
        blockedLaneIds: ['lane-7'],
        recoveryStage: 'REROUTE',
      }),
    }),
    v2Frame(340, {
      sample: {
        speedMps: 8,
        throttle: 0.5,
        steering: 0.15,
        longitudinalAccelerationMps2: 0.9,
        lateralAccelerationMps2: 1.4,
      },
      route: v2Route({
        alternatives: 3,
        selectedIndex: 1,
        costSeconds: 140,
        turnCount: 3,
        signalCount: 1,
        uTurnAvailable: true,
      }),
    }),
    v2Frame(400, {
      sample: {
        speedMps: 1.2,
        throttle: 0.2,
        steering: -0.2,
        longitudinalAccelerationMps2: 0.2,
      },
      route: v2Route({
        alternatives: 2,
        selectedIndex: 0,
        costSeconds: 120,
        recoveryStage: 'RECOVERY',
      }),
    }),
  ]);
}

/** HAZARDS — pieton observabil, obstacol, frână, viraj de evitare și claxon. */
function hazardsScenario(): V2ContextScenario {
  return v2Scenario('hazards-crosswalk-obstacle', 'HAZARDS', 'Pieton și obstacol pe bandă', [
    v2Frame(100, {
      sample: {
        speedMps: 9,
        throttle: 0.4,
        longitudinalAccelerationMps2: 0.2,
        stopLineId: 'sl-5',
        distanceToStopLineM: 30,
      },
      hazards: [pedestrian('ped-1')],
    }),
    v2Frame(160, {
      sample: {
        speedMps: 8,
        throttle: 0,
        brake: 0.3,
        longitudinalAccelerationMps2: -1.6,
        stopLineId: 'sl-5',
        distanceToStopLineM: 20,
      },
      hazards: [pedestrian('ped-1')],
    }),
    v2Frame(220, {
      sample: {
        speedMps: 4,
        throttle: 0,
        brake: 0.8,
        longitudinalAccelerationMps2: -3.4,
        stopLineId: 'sl-5',
        distanceToStopLineM: 10,
      },
      hazards: [pedestrian('ped-1')],
    }),
    v2Frame(280, {
      sample: {
        speedMps: 6,
        throttle: 0.2,
        brake: 0.2,
        steering: -0.25,
        longitudinalAccelerationMps2: -0.8,
        lateralAccelerationMps2: 2.2,
      },
      hazards: [obstacle('obs-1')],
    }),
    v2Frame(340, {
      sample: {
        speedMps: 5.5,
        throttle: 0.2,
        brake: 0.1,
        steering: -0.15,
        longitudinalAccelerationMps2: -0.2,
        lateralAccelerationMps2: 1.4,
      },
      hazards: [obstacle('obs-1')],
    }),
    v2Frame(400, {
      sample: {
        speedMps: 3,
        throttle: 0,
        brake: 0.4,
        longitudinalAccelerationMps2: -0.9,
        stopLineId: 'sl-5',
        distanceToStopLineM: 4,
      },
      hazards: [pedestrian('ped-1')],
      driverActions: [{ action: 'HORN', source: 'CONTROLLED_FIXTURE' }],
    }),
  ]);
}

/** SERVICE — pickup, dropoff, bordură, precizie și segmente cu pasager. */
function serviceScenario(): V2ContextScenario {
  return v2Scenario('service-pickup-dropoff', 'SERVICE', 'Pickup și dropoff cu pasager', [
    v2Frame(100, {
      sample: { speedMps: 7, throttle: 0.3, longitudinalAccelerationMps2: 0.2 },
      service: v2Service({ phase: 'TO_PICKUP', curbDistanceM: 0.8, stopPrecisionM: 2.5 }),
    }),
    v2Frame(160, {
      sample: { speedMps: 3, throttle: 0, brake: 0.4, longitudinalAccelerationMps2: -1.5 },
      service: v2Service({ phase: 'TO_PICKUP', curbDistanceM: 0.4, stopPrecisionM: 1.2 }),
    }),
    v2Frame(220, {
      sample: { speedMps: 0, throttle: 0, brake: 1, longitudinalAccelerationMps2: -0.05 },
      service: v2Service({ phase: 'AT_PICKUP', curbDistanceM: 0.25, stopPrecisionM: 0.35 }),
      events: [rideEvent(220, 'PICKUP', 'ride-9')],
    }),
    v2Frame(280, {
      sample: {
        speedMps: 8,
        throttle: 0.5,
        longitudinalAccelerationMps2: 1.1,
        curvaturePerM: 0.02,
        lateralAccelerationMps2: 2.4,
        rideId: 'ride-9',
      },
      service: v2Service({
        phase: 'TO_DROPOFF',
        curbDistanceM: 0.6,
        stopPrecisionM: 1,
        passengerOnboard: true,
      }),
    }),
    v2Frame(340, {
      sample: {
        speedMps: 0,
        throttle: 0,
        brake: 0.9,
        longitudinalAccelerationMps2: -0.05,
        rideId: 'ride-9',
      },
      service: v2Service({
        phase: 'AT_DROPOFF',
        curbDistanceM: 0.3,
        stopPrecisionM: 0.4,
        passengerOnboard: true,
      }),
      events: [rideEvent(340, 'DROPOFF', 'ride-9')],
    }),
    v2Frame(400, {
      sample: {
        speedMps: 6,
        throttle: 0.4,
        longitudinalAccelerationMps2: 0.7,
        curvaturePerM: 0.015,
        lateralAccelerationMps2: 1.9,
      },
      service: v2Service({ phase: 'TO_DROPOFF', curbDistanceM: 0.5, stopPrecisionM: 0.8 }),
    }),
  ]);
}

/** Negative control: flat urban cruising that must not make any context representative. */
function controlScenario(): V2ContextScenario {
  return v2Scenario(V2_CONTROL_SCENARIO_ID, null, 'Control: croazieră urbană uniformă', [
    v2Frame(100, {
      sample: { speedMps: 10, throttle: 0.3, longitudinalAccelerationMps2: 0 },
    }),
    v2Frame(160, {
      sample: { speedMps: 10, throttle: 0.3, longitudinalAccelerationMps2: 0 },
    }),
    v2Frame(220, {
      sample: { speedMps: 10, throttle: 0.3, longitudinalAccelerationMps2: 0 },
    }),
    v2Frame(280, {
      sample: { speedMps: 10, throttle: 0.3, longitudinalAccelerationMps2: 0 },
    }),
  ]);
}

export function v2ContextScenarios(): readonly V2ContextScenario[] {
  resetV2EventSequence();
  return Object.freeze([
    speedScenario(),
    longitudinalScenario(),
    followingScenario(),
    signalsScenario(),
    stopPriorityScenario(),
    laneChangeScenario(),
    lateralScenario(),
    routingScenario(),
    hazardsScenario(),
    serviceScenario(),
  ]);
}

export function v2ControlScenario(): V2ContextScenario {
  resetV2EventSequence();
  return controlScenario();
}

/**
 * Draws one key row per R parameter: key → context → scenario → label, plus the manual guide and the
 * observable facts. This is the same table the evidence document carries.
 */
export function v2ContextTable(): readonly {
  readonly key: string;
  readonly category: V2ContextCategory;
  readonly categoryTitle: string;
  readonly contextId: string;
  readonly label: string;
  readonly scenarioId: string;
  readonly requires: readonly string[];
  readonly opportunityKind: string | null;
  readonly constraint: string;
  readonly manual: { readonly setup: string; readonly action: string; readonly evidence: string };
}[] {
  return Object.freeze(
    v2ContextDefinitions.map((entry) =>
      Object.freeze({
        key: entry.key,
        category: entry.category,
        categoryTitle: v2ContextCategoryTitles[entry.category],
        contextId: entry.contextId,
        label: entry.label,
        scenarioId: entry.scenarioId,
        requires: entry.requires,
        opportunityKind: entry.opportunityKind,
        constraint: entry.constraint,
        manual: entry.manual,
      }),
    ),
  );
}

async function sha256Of(path: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export interface V2ContextReport {
  readonly version: typeof V2_CONTEXT_VERSION;
  readonly generatedBy: string;
  readonly command: string;
  readonly oracleRule: string;
  readonly catalog: ReturnType<typeof v2ContextCoverage>;
  readonly v1Compatibility: {
    readonly version: string;
    readonly protectedKeys: number;
    readonly preservedCatalogFields: readonly string[];
    readonly renamedKeys: readonly string[];
    readonly changedThresholds: readonly string[];
    readonly migration: string;
    readonly disjointFromR: boolean;
    readonly evidence: readonly {
      readonly path: string;
      readonly present: boolean;
      readonly sha256: string | null;
    }[];
  };
  readonly scenarios: readonly V2ScenarioEvaluation[];
  readonly control: V2ScenarioEvaluation;
  readonly contextTable: ReturnType<typeof v2ContextTable>;
  readonly summary: {
    readonly keys: number;
    readonly coveredKeys: number;
    readonly categories: number;
    readonly representativeCategories: number;
    readonly scenarios: number;
    readonly representativeScenarios: number;
    readonly frames: number;
    readonly controlObservableKeys: number;
    readonly controlRepresentative: boolean;
    readonly pass: boolean;
  };
  readonly reproducibility: { readonly digest: string; readonly rule: string };
  readonly limitations: readonly string[];
}

/**
 * Deterministic report: same scenarios, same order, no wall clock, no random. Two independent calls
 * produce the same digest, and `--check` compares the committed JSON with a fresh run.
 */
export async function runV2ContextReport(): Promise<V2ContextReport> {
  const scenarios = v2ContextScenarios().map((scenario) => evaluateV2ContextScenario(scenario));
  const control = evaluateV2ContextScenario(v2ControlScenario());
  const catalog = v2ContextCoverage();
  const v1Set = new Set<string>(v1ParameterKeys);
  const evidence = [];
  for (const relative of V1_COMPATIBILITY.evidencePreserved) {
    try {
      evidence.push(
        Object.freeze({
          path: relative,
          present: true,
          sha256: await sha256Of(join(root, relative)),
        }),
      );
    } catch {
      evidence.push(Object.freeze({ path: relative, present: false, sha256: null }));
    }
  }
  const representativeScenarios = scenarios.filter((scenario) => scenario.representative);
  const representativeCategories = new Set(
    representativeScenarios.map((scenario) => scenario.category),
  );
  const coveredKeys = new Set(
    scenarios.flatMap((scenario) =>
      scenario.keys
        .filter((entry) => entry.observable && entry.category === scenario.category)
        .map((entry) => entry.key),
    ),
  );
  const contextTable = v2ContextTable();
  const summary = Object.freeze({
    keys: catalog.keys,
    coveredKeys: coveredKeys.size,
    categories: catalog.categories,
    representativeCategories: representativeCategories.size,
    scenarios: scenarios.length,
    representativeScenarios: representativeScenarios.length,
    frames: scenarios.reduce((total, scenario) => total + scenario.frames, 0),
    controlObservableKeys: control.observableKeys,
    controlRepresentative: control.representative,
    pass: false,
  });
  const report = {
    version: V2_CONTEXT_VERSION,
    generatedBy: 'tests/telemetry/v2-contexts-suite.ts',
    command: 'npm run v2:contexts',
    oracleRule:
      'Fiecare context este numărat din faptele reale ale contractelor 085/069, 007, 030, 033/219 și 061; nicio valoare nu este afirmată fără un eșantion care o conține.',
    catalog,
    v1Compatibility: {
      version: V1_COMPATIBILITY.version,
      protectedKeys: v1ParameterKeys.length,
      preservedCatalogFields: V1_COMPATIBILITY.preservedCatalogFields,
      renamedKeys: V1_COMPATIBILITY.renamedKeys,
      changedThresholds: V1_COMPATIBILITY.changedThresholds,
      migration: V1_COMPATIBILITY.migration,
      disjointFromR: v2ContextDefinitions.every((entry) => !v1Set.has(entry.key)),
      evidence,
    },
    scenarios,
    control,
    contextTable,
    summary: Object.freeze({
      ...summary,
      pass:
        v2ContextCatalogValidation.valid &&
        summary.coveredKeys === 56 &&
        summary.representativeCategories === v2ContextCategories.length &&
        summary.representativeScenarios === v2RepresentativeScenarioIds.length &&
        !control.representative &&
        control.observableKeys === 0 &&
        evidence.every((entry) => entry.present),
    }),
    reproducibility: {
      digest: '',
      rule: 'Aceleași scenarii și aceeași ordine; SHA-256 peste catalog, evaluări și tabela de contexte.',
    },
    limitations: Object.freeze([
      'Nivel determinist în Node: fără browser real, GPU, input uman sau fizică live; contextul este dovedit pe eșantioane și fapte authoreză, nu pe o sesiune jucată.',
      'Claxonul nu are încă un canal live de input; contextul horn_use_probability este dovedit exclusiv prin fixture-ul controlat și rămâne o lacună declarată pentru canalul runtime.',
      'Faptele de rutare și de serviciu primesc valori măsurate de proprietarul lor (033/219, respectiv 061) sau de un fixture controlat; contractul le validează, nu le recalculează din geometrie.',
      'Pragurile numerice ale parametrilor rămân cele din catalogul de proiectare; 163 definește contextele, etichetele și scenariile, nu calibrează valorile.',
    ]),
  };
  const digest = createHash('sha256')
    .update(
      JSON.stringify({
        catalog: report.catalog,
        scenarios: report.scenarios,
        control: report.control,
        contextTable: report.contextTable,
        v1Compatibility: report.v1Compatibility,
      }),
    )
    .digest('hex');
  return Object.freeze({
    ...report,
    scenarios: Object.freeze(report.scenarios),
    control: report.control,
    contextTable: report.contextTable,
    summary: report.summary,
    reproducibility: Object.freeze({ ...report.reproducibility, digest }),
  }) as V2ContextReport;
}

/** Compares two independent runs; the test asserts this is stable. */
export async function v2ContextDigest(): Promise<string> {
  return (await runV2ContextReport()).reproducibility.digest;
}
