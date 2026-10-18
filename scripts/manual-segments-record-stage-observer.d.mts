export const STAGES: readonly string[];
export const OWNED_STAGE_BYTES: number;
export function recordStage<T>(name: string, action: () => T): T;
export function resetStages(on?: boolean): void;
export function enterStages(on: boolean, tick: number): void;
export function finishStages(): {
  ownedBytes: number;
  scope: string;
  observer: boolean;
  counts: Record<string, number[]>;
  times: Record<string, number[] | null>;
};
