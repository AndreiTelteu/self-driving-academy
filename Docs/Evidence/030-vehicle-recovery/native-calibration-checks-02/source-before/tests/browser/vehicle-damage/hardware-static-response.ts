import { readFile } from 'node:fs/promises';
export interface StaticResponse {
  readonly headersSent: boolean;
  writeHead(status: number, headers: Record<string, string>): unknown;
  end(body: Uint8Array | string): unknown;
  destroy(error?: Error): unknown;
}
export function respondFailure(response: StaticResponse, error: unknown, fallback = 400) {
  if (response.headersSent) {
    response.destroy(error instanceof Error ? error : new Error(String(error)));
    return;
  }
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  response.writeHead(code === 'ENOENT' ? 404 : fallback, { 'Content-Type': 'text/plain' });
  response.end(String(error));
}
export async function serveFrozenArtifact(
  response: StaticResponse,
  file: string,
  contentType: string,
  load: (file: string) => Promise<Uint8Array> = readFile,
) {
  try {
    const bytes = await load(file);
    response.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
    response.end(bytes);
  } catch (error) {
    respondFailure(response, error, 500);
  }
}
