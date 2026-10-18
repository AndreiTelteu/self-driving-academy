export function safeDiagnostic(
  value: unknown,
  limit?: number,
): { text: string; omittedCodeUnits: number };
