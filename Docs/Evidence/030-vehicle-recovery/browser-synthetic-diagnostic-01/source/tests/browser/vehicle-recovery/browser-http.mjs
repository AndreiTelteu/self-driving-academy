import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import assert from 'node:assert/strict';
import { safePath } from './browser-store.mjs';
/**No listening/server/native owner; injectable static+transport boundary for pure tests.*/
export function createHandler(build, store) {
  return async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1:5208');
    let requestBytes = 0;
    try {
      if (req.method === 'POST') {
        assert(
          req.headers.origin === 'http://localhost:5208' ||
            req.headers.origin === 'http://127.0.0.1:5208',
          'Sameoriginonly',
        );
        let bytes = 0,
          chunks = [];
        for await (const chunk of req) {
          bytes += chunk.length;
          requestBytes = bytes;
          assert(bytes <= 128 * 1024, 'Payload128KiB');
          chunks.push(chunk);
        }
        const data = JSON.parse(Buffer.concat(chunks));
        let result;
        if (url.pathname === '/start') result = await store.start(data.preference);
        else {
          const match = url.pathname.match(
            /^\/capture\/([0-9TZ]{10,40})\/(run-start|run-submitted|part|run-raw|run-complete|failure|finish)$/,
          );
          assert(match);
          result = await store.receive(match[1], match[2], data);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }
      assert.equal(req.method, 'GET');
      if (url.pathname === '/build') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(build));
        return;
      }
      const path =
        url.pathname === '/' ? 'browser.html' : decodeURIComponent(url.pathname.slice(1));
      const file = safePath(build.artifactRoot, path);
      const bytes = await readFile(file);
      res.writeHead(200, {
        'Content-Type':
          {
            '.html': 'text/html',
            '.js': 'application/javascript',
            '.css': 'text/css',
            '.wasm': 'application/wasm',
          }[extname(file)] ?? 'application/octet-stream',
      });
      res.end(bytes);
    } catch (error) {
      const match = url.pathname.match(/^\/capture\/([0-9TZ]{10,40})\//);
      if (
        match &&
        req.method === 'POST' &&
        !error.evidenceRejected &&
        (req.headers.origin === 'http://localhost:5208' ||
          req.headers.origin === 'http://127.0.0.1:5208')
      )
        try {
          await store.reject(match[1], 'HTTP', error, { path: url.pathname, requestBytes });
        } catch (exportError) {
          error = new AggregateError([error, exportError], 'HTTP/rejectedmetadataexportbothfailed');
        }
      if (!res.headersSent)
        res.writeHead(error.code === 'ENOENT' ? 404 : 400, { 'Content-Type': 'text/plain' });
      res.end(String(error));
    }
  };
}
