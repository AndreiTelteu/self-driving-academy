import assert from 'node:assert/strict';
import { FUNCTIONAL } from '../vehicle-recovery-after/functional-proof.ts';
/** Dedicated bounded functional transport delegates all original full-window paths unchanged. */
export function functionalHandler(fallback, store) {
  return async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1:5230');
    if (!url.pathname.startsWith('/functional/')) return fallback(req, res);
    let receivedBytes = 0;
    try {
      assert.equal(req.method, 'POST');
      assert(['http://127.0.0.1:5230', 'http://localhost:5230'].includes(req.headers.origin));
      const chunks = [];
      for await (const chunk of req) {
        receivedBytes += chunk.length;
        assert(receivedBytes <= FUNCTIONAL.reportBytes, 'Bounded2MiB functional request');
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      let result;
      if (url.pathname === '/functional/start') result = await store.start(JSON.parse(bytes));
      else {
        const m = url.pathname.match(/^\/functional\/([0-9TZ]{10,40})\/(report|failure)$/);
        assert(m);
        result = await store.receive(m[1], m[2], bytes);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      const m = url.pathname.match(/^\/functional\/([0-9TZ]{10,40})\//);
      if (
        m &&
        req.method === 'POST' &&
        ['http://127.0.0.1:5230', 'http://localhost:5230'].includes(req.headers.origin)
      )
        try {
          await store.reject(m[1], error, {
            path: url.pathname,
            receivedBytes,
            rawBodyRetained: false,
          });
        } catch (exportError) {
          error = new AggregateError(
            [error, exportError],
            'Functional original/rejection export causes',
          );
        }
      if (!res.headersSent)
        res.writeHead(receivedBytes > FUNCTIONAL.reportBytes ? 413 : 400, {
          'Content-Type': 'text/plain',
        });
      res.end(String(error));
    }
  };
}
