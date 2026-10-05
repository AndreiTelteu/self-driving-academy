export { parseRoadMap, mapSchemaLimits } from './parser';
export { MapValidationError } from './errors';
export {
  createCrosswalkZones,
  MAX_HAZARD_OBSERVATIONS,
  type HazardObservation,
  type CrosswalkQuery,
  type CrosswalkZone,
  type CrosswalkExposure,
} from './crosswalk-zones';
export {
  createLaneGraph,
  LANE_GRAPH_LIMITS,
  type LaneGraph,
  type LaneGraphStats,
  type DirectedLanePath,
  type LaneConnection,
  type LaneNeighbors,
  type LaneLocationQuery,
  type LaneProjection,
} from './lane-graph';
export type {
  RoadMap,
  Lane,
  RoadAccess,
  GeometryNode,
  GeometryPath,
  GeometryArea,
  Movement,
  Intersection,
  RoadSignal,
  SignalPhase,
  StopLine,
  Crosswalk,
  ServiceZone,
  RecoveryPoint,
} from './schema';
