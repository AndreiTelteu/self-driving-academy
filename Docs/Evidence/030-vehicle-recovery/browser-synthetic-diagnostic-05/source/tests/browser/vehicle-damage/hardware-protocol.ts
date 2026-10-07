import { HARDWARE_BUFFER_CAPS, HARDWARE_METRICS } from './hardware-collector';
import type { HardwareMetric } from './hardware-collector';
export const HARDWARE_PROTOCOL = Object.freeze({
  version: '029-scoped-hardware-v1',
  warmupSeconds: 30,
  measuredSeconds: 120,
  cars: 70,
  physicsHz: 60,
  targetHz: 10,
  pairs: 5,
  simulationWallMinimum: 0.98,
  cssWidth: 1920,
  cssHeight: 1080,
  internalWidth: 1920,
  internalHeight: 1080,
  dpr: 1,
  intervalFrameP95Ms: 18.5,
  intervalFrameP99Ms: 25,
  mainThreadP95Ms: 10,
  controllerTickP95Ms: 5.5,
  rapierP95Ms: 3,
  gpuP95Ms: 12,
  inputP95Ms: 50,
  rawHeapRelativeThreshold: 0.1,
  rawHeapAbsoluteThresholdBytes: 5 * 1024 * 1024,
  noAutomaticResume: true,
  noSelectiveRerun: true,
});
export interface MetricPort {
  readonly metric: HardwareMetric;
  readonly observer: 'COMMON' | 'ON';
  readonly timing: string;
  readonly availability: 'REQUIRED_ON' | 'OPTIONAL' | 'COMMON_REQUIRED';
}
export const HARDWARE_METRIC_PORTS: readonly MetricPort[] = Object.freeze(
  [
    {
      metric: 'frameIntervalMs',
      observer: 'COMMON',
      timing: 'Every measuredRAF interval, both observer modes; no rolling-window substitution',
      availability: 'COMMON_REQUIRED',
    },
    {
      metric: 'mainThreadFrameMs',
      observer: 'ON',
      timing:
        'Whole synchronous frame update/controller ticks/render/capture work; declared excluded asynchronous external work',
      availability: 'REQUIRED_ON',
    },
    {
      metric: 'controllerTickMs',
      observer: 'ON',
      timing:
        'Entire controller.step including physical actuation; scopedfixture tick not fullgameauthoritative tick',
      availability: 'REQUIRED_ON',
    },
    {
      metric: 'rapierStepMs',
      observer: 'ON',
      timing: 'PhysicsCosts.stepMs from actual native measured step',
      availability: 'REQUIRED_ON',
    },
    {
      metric: 'nativeControllerMs',
      observer: 'ON',
      timing: 'PhysicsCosts.controllerMs preparation stage',
      availability: 'OPTIONAL',
    },
    {
      metric: 'nativeQueryMs',
      observer: 'ON',
      timing: 'PhysicsCosts.queryMs stage',
      availability: 'OPTIONAL',
    },
    {
      metric: 'nativeBridgeMs',
      observer: 'ON',
      timing: 'PhysicsCosts.bridgeMs stage',
      availability: 'OPTIONAL',
    },
    {
      metric: 'drivetrainStageMs',
      observer: 'ON',
      timing:
        'Controller frame.drivetrainCpuMs; direction stage before029finalcap, no purealgorithmclaim',
      availability: 'OPTIONAL',
    },
    {
      metric: 'renderCpuMs',
      observer: 'ON',
      timing: 'Native-to-Babylon transform sync and synchronous scene.render',
      availability: 'OPTIONAL',
    },
    {
      metric: 'inputCommandLatencyMs',
      observer: 'ON',
      timing:
        'Observed software input/admission to actual nativeapplication; absent injection/physicalpixelclaim givesnull',
      availability: 'OPTIONAL',
    },
    {
      metric: 'gpuDurationMs',
      observer: 'ON',
      timing:
        'Actual resolved GPUtimer query from this measuredwindow; unsupported/pending/incomplete givesnull',
      availability: 'OPTIONAL',
    },
  ].map((port) => Object.freeze(port as MetricPort)),
);
if (
  HARDWARE_METRIC_PORTS.length !== HARDWARE_METRICS.length ||
  !HARDWARE_METRICS.every((metric) => HARDWARE_METRIC_PORTS.some((port) => port.metric === metric))
)
  throw new Error('Frozen metric identifiers differ');
/** Declarative sequence only. No browser, nativeworld, server or automatic execution. */
export function fullBackendSequence() {
  const result = [];
  for (let pair = 0; pair < 5; pair++)
    for (const observer of pair % 2 ? [true, false] : [false, true])
      for (const arm of pair % 2
        ? (['CURRENT_029', 'PUBLISHED_027'] as const)
        : (['PUBLISHED_027', 'CURRENT_029'] as const))
        result.push(
          Object.freeze({
            runOrdinal: result.length,
            pair,
            observer,
            arm,
            warmupSeconds: 30,
            measuredSeconds: 120,
          }),
        );
  if (result.length !== HARDWARE_BUFFER_CAPS.runsPerBackend)
    throw new Error('Protocol sequence cap');
  return Object.freeze(result);
}
export const EXPECTED_TYPED_ARRAY_BYTES = Object.freeze({
  on:
    HARDWARE_BUFFER_CAPS.onHistogramBytes +
    HARDWARE_BUFFER_CAPS.heapBytes +
    HARDWARE_BUFFER_CAPS.endpointBytes +
    HARDWARE_BUFFER_CAPS.checkpointBytes +
    HARDWARE_BUFFER_CAPS.actorTickBytes +
    HARDWARE_BUFFER_CAPS.hashScratchBytes,
  off:
    HARDWARE_BUFFER_CAPS.offHistogramBytes +
    HARDWARE_BUFFER_CAPS.endpointBytes +
    HARDWARE_BUFFER_CAPS.checkpointBytes +
    HARDWARE_BUFFER_CAPS.actorTickBytes +
    HARDWARE_BUFFER_CAPS.hashScratchBytes,
  scope: 'Explicit buffer ceilings; excludes JSobject/native/GPU memory and is never totalRAM.',
});
