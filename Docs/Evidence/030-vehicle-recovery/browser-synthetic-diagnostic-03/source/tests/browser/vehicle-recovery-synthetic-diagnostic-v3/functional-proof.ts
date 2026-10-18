import { validateFunctional as validateOriginal, FUNCTIONAL, functionalCheck } from './core-proof';
import { nextFixtureOpenBoundary } from './next-open-boundary';
import { validateDriverLedger } from './driver-proof';
export { FUNCTIONAL };
/** Original gameplay assertions plus synthetic provenance; physical trust explicitly excluded. */
export function validateFunctional(raw: unknown, build: unknown) {
  const verdict = validateOriginal(raw, build);
  const report = raw as {
    cases: {
      segmentAfter: Parameters<typeof nextFixtureOpenBoundary>[0];
      recovered: { record: { acceptedTick: number; status: string } };
      rows: { tick: number; nativeSerial: number }[];
      setupWrites: Record<string, unknown>[];
    }[];
  };
  for (const row of report.cases) {
    validateDriverLedger(row);
    const transitions = row.setupWrites.filter(
      (write) => write.stage === 'LABELED_NEXT_OPEN_005_BOUNDARY',
    );
    functionalCheck(transitions.length === 1, 'Exactly one acknowledged next005fixture boundary');
    const transition = transitions[0]!;
    const nextTick = row.recovered.record.acceptedTick + 1;
    const next = nextFixtureOpenBoundary(row.segmentAfter, nextTick);
    functionalCheck(
      row.recovered.record.status === 'COMPLETED',
      '005lifecycle starts after suffix acknowledgement',
    );
    functionalCheck(
      transition.acceptedTick === nextTick &&
        transition.nativeSerial === row.rows[nextTick - 1]?.nativeSerial,
      'Fixture transition binds existing neutral tick/native serial',
    );
    functionalCheck(
      JSON.stringify(transition.closed) === JSON.stringify(row.segmentAfter) &&
        JSON.stringify(transition.open) === JSON.stringify(next),
      'Preserved closed005history and exact unique fresh OPEN prefix',
    );
  }
  return verdict;
}
