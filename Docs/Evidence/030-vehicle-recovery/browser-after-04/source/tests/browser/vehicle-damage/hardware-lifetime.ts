export interface HarnessCause {
  readonly category: string;
  readonly message: string;
}
export class HarnessFailure extends Error {
  readonly scope: object;
  readonly causes: readonly HarnessCause[];
  readonly totalCauses: number;
  constructor(scope: object, causes: readonly HarnessCause[], totalCauses: number) {
    super(causes.map((cause) => `${cause.category}: ${cause.message}`).join('\n'));
    this.name = 'HarnessFailure';
    this.scope = scope;
    this.causes = causes;
    this.totalCauses = totalCauses;
  }
}
/** Bounded error ledger and once-only resource ownership. No world/render/API dependency. */
export function createHarnessLifetime() {
  const resources: { label: string; release: () => unknown; attempted: boolean; value: unknown }[] =
    [];
  const causes: HarnessCause[] = [];
  let totalCauses = 0;
  const scope = {
    get failed() {
      return totalCauses > 0;
    },
    record(category: string, error: unknown) {
      if (error instanceof HarnessFailure && error.scope === scope) return;
      const nested =
        error instanceof HarnessFailure
          ? error.causes.map((cause) => `${cause.category}: ${cause.message}`)
          : error instanceof AggregateError
            ? error.errors
            : [error];
      if (error instanceof HarnessFailure) totalCauses += error.totalCauses - error.causes.length;
      for (const cause of nested) {
        totalCauses++;
        if (causes.length < 32)
          causes.push(Object.freeze({ category, message: String(cause).slice(0, 2048) }));
      }
    },
    own<T>(label: string, release: () => T) {
      if (resources.length >= 160) throw new Error('Bounded ownership capacity');
      const entry = { label, release, attempted: false, value: undefined as unknown };
      resources.push(entry);
      return () => {
        if (!entry.attempted) {
          entry.attempted = true;
          try {
            entry.value = entry.release();
          } catch (error) {
            scope.record(`cleanup:${label}`, error);
          }
        }
        return entry.value as T | undefined;
      };
    },
    dispose() {
      for (let index = resources.length - 1; index >= 0; index--) {
        const entry = resources[index];
        if (!entry.attempted) {
          entry.attempted = true;
          try {
            entry.value = entry.release();
          } catch (error) {
            scope.record(`cleanup:${entry.label}`, error);
          }
        }
      }
    },
    snapshot() {
      return {
        causes: [...causes],
        totalCauses,
        omittedCauses: totalCauses - causes.length,
        resources: resources.length,
        attempted: resources.filter((resource) => resource.attempted).length,
      };
    },
    throwIfFailed() {
      if (scope.failed) throw new HarnessFailure(scope, [...causes], totalCauses);
    },
    async attempt(category: string, operation: () => Promise<unknown>) {
      try {
        return await operation();
      } catch (error) {
        scope.record(category, error);
        return undefined;
      }
    },
  };
  return scope;
}
/** The runner's acquired workload is registered before awaiting readiness. */
export async function awaitOwnedReadiness<T, R>(
  scope: ReturnType<typeof createHarnessLifetime>,
  label: string,
  value: T,
  dispose: () => R,
  ready: (value: T) => Promise<void>,
) {
  const release = scope.own(label, dispose);
  try {
    await ready(value);
  } catch (error) {
    scope.record('primary:readiness', error);
    scope.throwIfFailed();
  }
  return release;
}
