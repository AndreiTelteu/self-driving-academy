/** Transport encoding only. Preserves every accepted UTF-16 code unit, including lone surrogates. */
export function encodeDiagnosticText(text: string, maximumCodeUnits = 2048) {
  if (text.length > maximumCodeUnits) throw new Error('Diagnostic accepted text capacity');
  let bytes = '';
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    bytes += String.fromCharCode(unit & 255, unit >>> 8);
  }
  return { encoding: 'UTF16LE_BASE64' as const, codeUnitCount: text.length, data: btoa(bytes) };
}
export function decodeDiagnosticText(value: unknown, maximumCodeUnits = 2048) {
  if (!value || typeof value !== 'object') throw new Error('Diagnostic encoding DTO');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new Error('Plain own-data diagnostic DTO');
  const keys = Object.keys(value);
  if (keys.length !== 3 || keys.sort().join(',') !== 'codeUnitCount,data,encoding')
    throw new Error('Exact diagnostic fields');
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value'))
      throw new Error('Diagnostic getter rejected before access');
  }
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).sort().join(',') !== 'codeUnitCount,data,encoding' ||
    row.encoding !== 'UTF16LE_BASE64' ||
    !Number.isSafeInteger(row.codeUnitCount) ||
    (row.codeUnitCount as number) < 0 ||
    (row.codeUnitCount as number) > maximumCodeUnits ||
    typeof row.data !== 'string' ||
    row.data.length !== 4 * Math.ceil((2 * (row.codeUnitCount as number)) / 3)
  )
    throw new Error('Bounded diagnostic encoding');
  const bytes = atob(row.data);
  if (btoa(bytes) !== row.data || bytes.length !== 2 * (row.codeUnitCount as number))
    throw new Error('Canonical diagnostic base64/length');
  let text = '';
  for (let i = 0; i < bytes.length; i += 2)
    text += String.fromCharCode(bytes.charCodeAt(i) | (bytes.charCodeAt(i + 1) << 8));
  return text;
}
export function encodeDiagnosticOwnership<
  T extends { causes: { category: string; message: string }[] },
>(value: T) {
  return {
    ...value,
    causes: value.causes.map((cause) => ({
      category: cause.category,
      message: encodeDiagnosticText(cause.message),
    })),
  };
}
/** Existing primary-text 4096-unit cap, now disclosed; full accepted ledger entries are separate. */
export function functionalPrimaryCause(error: unknown) {
  const text = String(error),
    retained = text.slice(0, 4096);
  return {
    scope: 'PRIMARY_TEXT_ONLY_WITH_SEPARATE_CAUSE_LEDGER',
    originalCodeUnits: text.length,
    retainedCodeUnits: retained.length,
    omittedCodeUnits: text.length - retained.length,
    prefixOnly: retained.length !== text.length,
    text: encodeDiagnosticText(retained, 4096),
  };
}
