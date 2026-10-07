/** Actual archived027 source; the build must first validate reference-provenance.json against published Git blobs. */
export { createVehicleController as createPublished027Controller } from '../../../Docs/Evidence/027-braking-reverse/source-at-capture/src/vehicles/controller';
export const HARDWARE_REFERENCE = Object.freeze({
  publishedCommit: 'f1c6428034c1d52ae0eb3e88857fb6f61ffd43ce',
  executedArchiveRoot: 'Docs/Evidence/027-braking-reverse/source-at-capture',
  capturedManifest: 'Docs/Evidence/027-braking-reverse/build-manifest.json',
  capturedSourceHash: '11b8ea1e7217c40397928c225c559fa673b6118d13af16370df28362d9ee7609',
  captureCommit: 'd80bf721e536ff1400dc48e1656169ac2fecfa61',
  requiredProvenance: 'Docs/Evidence/029-vehicle-damage/reference-provenance.json',
  currentProductionCommit: 'bf78ad85bb0b32e63d065e663829c6aa8cad2fb1',
  configuration:
    'Both arms027opt-in; published027 has no029provider, current has029AVAILABLE. Separate postimplementation hardware control, not chronologicalCPUbaseline replacement.',
});
