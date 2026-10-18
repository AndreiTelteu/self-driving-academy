import { encodeIdentityParts } from './identity';
import { number, requireContract, text, tick } from './validation';

export const RANDOM_VERSION = 1;
export const MAX_RANDOM_KEY_LENGTH = 8192;
export type RandomSeed = number;

function readSeed(value: unknown): RandomSeed {
  const result = number(value, 0, 0xffff_ffff);
  requireContract(Number.isInteger(result), 'Expected uint32 seed');
  return result;
}

function readKey(value: unknown): string {
  const result = text(value);
  requireContract(result.length <= MAX_RANDOM_KEY_LENGTH, 'Random key exceeds length limit');
  return result;
}

/** FNV-1a over UTF-16LE bytes, followed by a fixed uint32 avalanche (non-cryptographic). */
function hash(seed: RandomSeed, domain: string, keys: readonly string[]): RandomSeed {
  const encoded = encodeIdentityParts([
    String(RANDOM_VERSION),
    domain,
    String(readSeed(seed)),
    ...keys,
  ]);
  let value = 0x811c9dc5;
  for (let index = 0; index < encoded.length; index += 1) {
    const code = encoded.charCodeAt(index);
    value = Math.imul(value ^ (code & 0xff), 0x01000193);
    value = Math.imul(value ^ (code >>> 8), 0x01000193);
  }
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
  return (value ^ (value >>> 16)) >>> 0;
}

export function deriveScenarioSeed(rootSeed: RandomSeed, scenarioId: string): RandomSeed {
  return hash(rootSeed, 'scenario', [readKey(scenarioId)]);
}

export function deriveVehicleSeed(scenarioSeed: RandomSeed, vehicleId: string): RandomSeed {
  return hash(scenarioSeed, 'vehicle', [readKey(vehicleId)]);
}

export function deriveOpportunitySeed(vehicleSeed: RandomSeed, opportunityKey: string): RandomSeed {
  return hash(vehicleSeed, 'opportunity', [readKey(opportunityKey)]);
}

/** An explicit index addresses a sample; calls never consume shared mutable state. */
export function randomUint32(seed: RandomSeed, sampleKey: string, sampleIndex = 0): number {
  return hash(seed, 'sample', [readKey(sampleKey), String(tick(sampleIndex))]);
}

/** Uniform grid of 2^32 values in [0, 1), with no inclusive upper endpoint. */
export function randomUnit(seed: RandomSeed, sampleKey: string, sampleIndex = 0): number {
  return randomUint32(seed, sampleKey, sampleIndex) / 0x1_0000_0000;
}
