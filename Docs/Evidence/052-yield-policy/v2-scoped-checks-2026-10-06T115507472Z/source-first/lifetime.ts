export interface BrowserCause {
  readonly category: string;
  readonly message: string;
}
export class BrowserHarnessFailure extends Error {
  constructor(
    readonly owner: object,
    readonly snapshot: {
      causes: readonly BrowserCause[];
      total: number;
      omitted: number;
      readbacks: Readonly<Record<string, unknown>>;
    },
  ) {
    super(snapshot.causes.map((cause) => `${cause.category}: ${cause.message}`).join('\n'));
    this.name = 'BrowserHarnessFailure';
  }
}
/** Fixture ownership only: bounded causes, no swallowed cleanup and no repeated disposal. */
export function browserLifetime() {
  const releases: { name: string; release: () => unknown; attempted: boolean }[] = [];
  const causes: BrowserCause[] = [];
  let total = 0;
  const inspectors: {
    name: string;
    read: () => unknown;
    validate?: (value: unknown) => void;
    attempted: boolean;
  }[] = [];
  const readbacks: Record<string, unknown> = Object.create(null);
  const scope = {
    own(name: string, release: () => unknown) {
      if (releases.length >= 256) throw new Error('052 browser resource capacity');
      releases.push({ name, release, attempted: false });
    },
    inspect(name: string, read: () => unknown, validate?: (value: unknown) => void) {
      if (inspectors.length >= 256 || inspectors.some((item) => item.name === name))
        throw new Error('052 readback capacity/duplicate');
      inspectors.push({ name, read, validate, attempted: false });
    },
    readback<T>(name: string): T {
      if (!Object.hasOwn(readbacks, name))
        throw new Error('052 actual cleanup readback unavailable: ' + name);
      return readbacks[name] as T;
    },
    record(category: string, error: unknown) {
      if (error instanceof BrowserHarnessFailure) {
        if (error.owner === scope) return;
        total += error.snapshot.total;
        if (Object.keys(readbacks).length < 256)
          readbacks[category + ':nested:' + Object.keys(readbacks).length] =
            error.snapshot.readbacks;
        for (const cause of error.snapshot.causes) {
          if (causes.length < 32)
            causes.push({ category: `${category}/${cause.category}`, message: cause.message });
        }
        return;
      }
      total++;
      if (causes.length < 32) causes.push({ category, message: String(error).slice(0, 2048) });
    },
    dispose() {
      for (let index = releases.length - 1; index >= 0; index--) {
        const item = releases[index]!;
        if (item.attempted) continue;
        item.attempted = true;
        try {
          item.release();
        } catch (error) {
          scope.record(`cleanup:${item.name}`, error);
        }
      }
      for (const item of inspectors) {
        if (item.attempted) continue;
        item.attempted = true;
        try {
          readbacks[item.name] = item.read();
          item.validate?.(readbacks[item.name]);
        } catch (error) {
          scope.record('readback:' + item.name, error);
        }
      }
    },
    snapshot() {
      return {
        causes: [...causes],
        total,
        omitted: total - causes.length,
        readbacks: { ...readbacks },
        resources: releases.length,
        attempted: releases.filter((item) => item.attempted).length,
      };
    },
    get failed() {
      return total > 0;
    },
    throwIfFailed() {
      if (total) throw new BrowserHarnessFailure(scope, scope.snapshot());
    },
  };
  return scope;
}
