/** Independent scalar oracle declared before production046. No parsing/ownership. */
export function referenceCruise(
  values: readonly number[],
  road: string,
  posted: number,
  radius: number | null,
  intersection: boolean,
  state: string,
  minimumRadius: number,
) {
  const preferred = Math.max(0, posted + values[road === 'URBAN' ? 0 : 1]);
  const candidates = [preferred, 30];
  if (radius !== null) candidates.push(Math.sqrt(values[2] * radius));
  if (intersection) candidates.push(values[3]);
  if (
    ['STOP', 'YIELD', 'BLOCKED', 'SERVICE'].includes(state) ||
    (radius !== null && radius < minimumRadius)
  )
    candidates.push(0);
  return Math.min(...candidates);
}
export const cruiseValues = [
  [-2, -3, 1.5, 4],
  [8, 6, 8, 15],
] as const;
export function cruiseProfile(values: readonly number[]) {
  const keys = [
    'speed_delta_urban',
    'speed_delta_residential',
    'curve_lateral_accel',
    'intersection_approach_speed',
  ];
  return {
    schemaVersion: 1,
    units: 'SI',
    profileId: '046-fixture',
    versionId: values[0] < 0 ? '046-prudent-v1' : '046-aggressive-v1',
    parentVersionId: null,
    engineVersion: '046-cruise-v1',
    parameters: Object.fromEntries(keys.map((k, i) => [k, values[i]])),
    unitsByParameter: Object.fromEntries(keys.map((k, i) => [k, i === 2 ? 'm/s²' : 'm/s'])),
    provenanceByParameter: Object.fromEntries(keys.map((k) => [k, 'BASE'])),
    evidenceByParameter: Object.fromEntries(keys.map((k) => [k, null])),
    sourceSegmentIds: [],
    createdAt: '2026-10-12T00:00:00Z',
    checksum: 'unverified:046-fixture',
  };
}
