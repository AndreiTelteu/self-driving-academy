import type { Vector3 } from '../vehicles';
export type RoadAccess = 'TAXI' | 'CIVIL';
export interface GeometryNode {
  readonly id: string;
  readonly positionM: Vector3;
}
export interface GeometryPath {
  readonly id: string;
  readonly nodeIds: readonly string[];
}
export interface GeometryArea {
  readonly id: string;
  readonly vertexNodeIds: readonly string[];
}
export interface Lane {
  readonly id: string;
  readonly geometryId: string;
  readonly direction: 'FORWARD' | 'REVERSE';
  readonly widthM: number;
  readonly speedLimitMps: number;
  readonly access: readonly RoadAccess[];
  readonly neighbors: { readonly left: string | null; readonly right: string | null };
  readonly successorIds: readonly string[];
  readonly fromIntersectionId: string | null;
  readonly toIntersectionId: string | null;
}
export interface Movement {
  readonly id: string;
  readonly geometryId: string;
  readonly fromLaneId: string;
  readonly toLaneId: string;
  readonly conflictZoneIds: readonly string[];
}
export interface Intersection {
  readonly id: string;
  readonly geometryId: string;
  readonly incomingLaneIds: readonly string[];
  readonly outgoingLaneIds: readonly string[];
  readonly conflictZones: readonly { readonly id: string; readonly geometryId: string }[];
  readonly movements: readonly Movement[];
}
export interface SignalPhase {
  readonly id: string;
  readonly durationS: number;
  readonly movementStates: readonly {
    readonly movementId: string;
    readonly state: 'RED' | 'YELLOW' | 'GREEN';
  }[];
}
export interface RoadSignal {
  readonly id: string;
  readonly intersectionId: string;
  readonly phases: readonly SignalPhase[];
}
export interface StopLine {
  readonly id: string;
  readonly geometryId: string;
  readonly laneId: string;
  readonly anchorNodeId: string;
  readonly kind: 'STOP' | 'SIGNAL' | 'CROSSWALK';
  readonly intersectionId: string | null;
  readonly signalId: string | null;
}
export interface Crosswalk {
  readonly id: string;
  readonly geometryId: string;
  readonly laneIds: readonly string[];
  readonly stopLineIds: readonly string[];
}
export interface ServiceZone {
  readonly id: string;
  readonly geometryId: string;
  readonly laneId: string;
  readonly anchorNodeId: string;
  readonly access: readonly RoadAccess[];
  readonly kind: 'PICKUP' | 'DROPOFF' | 'BOTH';
}
export interface RecoveryPoint {
  readonly id: string;
  readonly nodeId: string;
  readonly laneId: string;
  readonly headingRad: number;
}
export interface RoadMap {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly mapId: string;
  readonly bounds: { readonly minM: Vector3; readonly maxM: Vector3 };
  readonly geometry: {
    readonly nodes: readonly GeometryNode[];
    readonly paths: readonly GeometryPath[];
    readonly areas: readonly GeometryArea[];
  };
  readonly lanes: readonly Lane[];
  readonly intersections: readonly Intersection[];
  readonly signals: readonly RoadSignal[];
  readonly stopLines: readonly StopLine[];
  readonly crosswalks: readonly Crosswalk[];
  readonly serviceZones: readonly ServiceZone[];
  readonly recoveryPoints: readonly RecoveryPoint[];
}
