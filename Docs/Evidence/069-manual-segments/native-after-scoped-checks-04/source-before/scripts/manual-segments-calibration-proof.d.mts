/** Declaration-only surface for the bounded Node evidence helper; no runtime initialization. */
import type { InterventionLifecycle, InterventionSegment } from '../src/telemetry/index.ts';

export const CHECKED_PRODUCT_SHA: 'de072b4acb1a3f7879ce62ba94ba13476c1ac40af822f53504720d7a8ed1f1b6';
export const CALIBRATION_CLOSURE: readonly string[];
export interface CheckedProductRow {
  path: string;
  bytes: number;
  sha256: string;
}
export interface DiagnosticRow {
  name: string;
  message: string;
  stack: string;
  causes?: DiagnosticRow[];
  omittedCauses?: number | 'OPAQUE_ERRORS_ARRAY';
}
export interface DiagnosticState {
  remaining: number;
  seen: Set<unknown>;
}
export type BoundedDiagnosticValue =
  | null
  | boolean
  | number
  | string
  | { [key: string]: BoundedDiagnosticValue };
export interface OwnerIntakeProof {
  operationId: string;
  segmentId: string;
  recordBytes: number;
}
export function validateCheckedProduct(checked: unknown): CheckedProductRow[];
export function validateCalibrationClosure(paths: readonly string[], checked: unknown): void;
export function validateOwnerTiming(boundary: unknown): void;
export function validateOwnerIntake(
  record: InterventionSegment,
  descriptor: unknown,
  receipt: unknown,
  owner: Pick<ReturnType<InterventionLifecycle['observe']>, 'results' | 'pending' | 'fault'>,
): OwnerIntakeProof;
export function readDiagnosticField(value: unknown, key: PropertyKey): unknown;
export function serializeDiagnostic(error: unknown, depth?: number, state?: DiagnosticState): DiagnosticRow;
export function boundedDiagnosticData(
  value: unknown,
  depth?: number,
  state?: { remaining: number },
): BoundedDiagnosticValue;
export function exportFailurePreserving(
  original: unknown,
  write: () => unknown | Promise<unknown>,
): Promise<void>;
