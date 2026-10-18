/** Consume exactly one response body. Preserve server rejection text before rejecting an ACK. */
export async function readAcknowledgment(
  response: Response,
  path: string,
): Promise<{ sha256: string }> {
  if (!response.ok) throw Error(path + ' HTTP ' + response.status + ': ' + (await response.text()));
  return response.json() as Promise<{ sha256: string }>;
}
