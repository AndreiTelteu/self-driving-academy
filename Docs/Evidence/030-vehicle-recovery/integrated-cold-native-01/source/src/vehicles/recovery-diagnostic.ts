/** Cold diagnostics only: never inspect/coerce an arbitrary thrown value. */
export function recoveryFailureText(error: unknown, fallback: string): string {
  return typeof error === 'string' && error.length > 0 ? error.slice(0, 512) : fallback;
}
