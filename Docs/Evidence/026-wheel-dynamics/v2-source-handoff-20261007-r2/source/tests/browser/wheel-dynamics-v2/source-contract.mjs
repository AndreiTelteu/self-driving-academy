/** SOURCE ONLY manifest: finite admission declarations, never runtime/PASS evidence. */
export const SOURCE_CONTRACT = Object.freeze({
  version:'026-v2-r2-source',
  requestBytes:4194304, logicalRecordBytes:16777216, partBytes:524288, partsPerRecord:32,
  rawArms:10, channels:5, samplesPerChannel:30000, rawBackingBytesPerArm:1200000,
  journalEventsPerLifetime:4096, journalEncodedBytesPerEvent:2048,
  causesPerLifetime:128, causeErrorCodeUnits:1024, causeStageCodeUnits:128,
  longTasksPerArm:4096, supplementalLateEventsPerCapture:64, supplementalLateErrorRecordsPerCapture:64,
  terminalErrorRecordsPerCapture:1, calibrationBrakeCurvePoints:300, calibrationTurnCurvePoints:30,
  rafHistory:'Counters + last trigger and native/render boundaries; no per-frame event append',
  memoryScope:'Admission/backing categories only. Not summed totalRAM; browser encoding/readback copies require later pricing.',
});
