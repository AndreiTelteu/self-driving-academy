export const context = { schemaVersion: 1, units: 'SI', sessionId: 'academy-1', worldEpoch: 2 };
export function command() {
  return {
    ...context,
    vehicleId: 'taxi-1',
    tick: 10,
    throttle: 0.5,
    brake: 0,
    steering: -0.2,
    handbrake: false,
    turnSignal: 'LEFT',
    source: 'PLAYER',
  };
}
export function state() {
  return {
    ...context,
    vehicleId: 'taxi-1',
    classId: 'sedan',
    tick: 10,
    transform: { positionM: { x: 1, y: 2, z: 3 }, rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 } },
    velocityMps: { x: -1, y: 0, z: 5 },
    laneId: 'lane-1',
    controlMode: 'LEARNING',
    appliedProfileVersion: 'style-v1',
    maneuverState: 'FOLLOWING',
  };
}
export function ride() {
  return {
    ...context,
    rideId: 'ride-1',
    taxiId: 'taxi-1',
    pickupId: 'stop-1',
    dropoffId: 'stop-2',
    routeLaneIds: ['lane-1'],
    eventIds: ['event-1'],
    status: 'COMPLETED',
    createdTick: 0,
    assignedTick: 1,
    completedTick: 20,
    failureReason: null,
  };
}
export function event() {
  return {
    ...context,
    eventId: 'event-1',
    tick: 10,
    entityIds: ['taxi-1', 'civilian-1'],
    type: 'COLLISION',
    payload: { vehicleId: 'taxi-1', otherEntityId: 'civilian-1', impulseNs: 10 },
  };
}
export function sample() {
  return {
    tick: 10,
    state: state(),
    command: command(),
    rawInput: { throttle: 1, brake: 0, steering: -1, handbrake: false },
    longitudinalAccelerationMps2: 2,
    lateralAccelerationMps2: -1,
    capabilities: { maxAccelerationMps2: 6, maxDecelerationMps2: 8, maxLateralAccelerationMps2: 5 },
    context: {
      roadType: 'URBAN',
      speedLimitMps: 12,
      curvaturePerM: 0.02,
      leaderId: 'civilian-1',
      leaderGapM: 5,
      signalId: null,
      signalState: null,
      stopLineId: null,
      distanceToStopLineM: null,
      conflictEntityIds: ['civilian-1'],
      rideId: 'ride-1',
    },
    excludedReason: 'COLLISION_IMPULSE',
  };
}
export function segment() {
  return {
    ...context,
    segmentId: 'segment-1',
    vehicleId: 'taxi-1',
    controlMode: 'LEARNING',
    learningEligible: true,
    playerId: 'player-1',
    profileId: 'style-1',
    baseVersionId: 'style-v1',
    learningEpoch: 3,
    controlPreferencesVersion: 'input-v1',
    startTick: 10,
    endTick: 20,
    closeReason: 'RETURN_TO_AUTO',
    engineVersion: 'engine-1',
    mapVersion: 'map-1',
    inputType: 'KEYBOARD',
    samples: [sample()],
    events: [event()],
    completeness: 'CLOSED',
  };
}
export function evidence() {
  return {
    key: 'following_time_headway',
    effectiveCount: 2.5,
    contexts: ['urban-following'],
    quality: 0.8,
    uncertainty: 0.1,
    sourceSegmentIds: ['segment-1'],
    estimatorVersion: 'estimator-1',
  };
}
export function profile() {
  return {
    schemaVersion: 1,
    units: 'SI',
    profileId: 'style-1',
    versionId: 'style-v1',
    parentVersionId: null,
    engineVersion: 'engine-1',
    parameters: { following_time_headway: 1.5, reserved_future_key: -2 },
    unitsByParameter: { following_time_headway: 's', reserved_future_key: 'm/s' },
    provenanceByParameter: { following_time_headway: 'LEARNED', reserved_future_key: 'BASE' },
    evidenceByParameter: { following_time_headway: evidence(), reserved_future_key: null },
    sourceSegmentIds: ['segment-1'],
    createdAt: '2026-10-05T00:00:00.000Z',
    checksum: 'unverified:fixture',
  };
}
