import { list, requireContract, text } from './validation';

export const IDENTITY_VERSION = 1;
export const MAX_IDENTITY_PART_LENGTH = 256;
export const MAX_IDENTITY_KEY_PARTS = 16;

/** Identity parts preserve exact UTF-16 code units; no trimming or Unicode normalization. */
export function identityPart(value: unknown): string {
  const result = text(value);
  requireContract(result.length <= MAX_IDENTITY_PART_LENGTH, 'Identity part exceeds length limit');
  return result;
}

/** Length prefixes make component boundaries unambiguous, including embedded delimiters. */
export function encodeIdentityParts(parts: readonly string[]): string {
  return parts.map((part) => `${part.length}:${part}`).join('');
}

/** The caller supplies a stable namespace and semantic keys, never array positions or clocks. */
export function createStableId(
  kind: string,
  namespace: string,
  keyParts: readonly string[],
): string {
  const keys = list(keyParts, identityPart);
  requireContract(
    keys.length > 0 && keys.length <= MAX_IDENTITY_KEY_PARTS,
    'Expected between one and sixteen identity keys',
  );
  return `id-v${IDENTITY_VERSION}:${encodeIdentityParts([
    identityPart(kind),
    identityPart(namespace),
    ...keys,
  ])}`;
}
