export class CaptureLifetime {
  constructor(
    ports: {
      now(): number;
      foreground(): boolean;
      requestRaf(callback: (stamp: number) => void): number;
      cancelRaf(id: number): void;
      setTimer(callback: () => void, milliseconds: number): number;
      clearTimer(id: number): void;
    },
    capacity?: number,
  );
  failed: boolean;
  closed: boolean;
  causes: unknown[];
  cause(stage: string, error: unknown): void;
  fail(stage: string, error: unknown): void;
  record(kind: string, detail?: object): void;
  own(name: string, dispose: () => unknown): void;
  readback(name: string, read: () => unknown): void;
  boundary(name: string, counters: object): void;
  nextFrame(counters: () => object): Promise<number>;
  teardown(): Promise<Record<string, unknown>>;
  snapshot(): { causes: unknown[]; causeOverflow: number; [key: string]: unknown };
  onLate(sink: (event: unknown) => Promise<unknown>): void;
  lateQueue: Promise<unknown>;
}
export function runOwned(
  lifetime: CaptureLifetime,
  acquireAndRun: (life: CaptureLifetime) => unknown,
  exportTerminal: (terminal: unknown) => unknown,
): Promise<unknown>;
