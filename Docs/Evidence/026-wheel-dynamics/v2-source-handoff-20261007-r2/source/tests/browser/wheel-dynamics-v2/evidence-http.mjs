import { readEvidenceJson, EvidenceTransportError } from './transport.mjs';
/** Side-effect-free HTTP route factory; server and authored HTTP drafts consume this same handler. */
export function createEvidenceHandler(ledger, parts, sourceHash) {
  return async (request, response) => {
    const send = value => response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(value));
    if (request.method === 'POST' && request.url === '/capture/start') {
      const dto = await readEvidenceJson(request);
      if (dto.clientSourceHash !== sourceHash) throw new EvidenceTransportError(400, 'Client source mismatch');
      send(await ledger.start(dto)); return true;
    }
    if (request.method === 'POST' && request.url === '/capture/parts') {
      send(await parts.append(await readEvidenceJson(request))); return true;
    }
    const append = /^\/capture\/(backend|terminal|terminal-error|raw-[0-9]|late-(?:error-)?[0-9]{1,2})$/.exec(request.url ?? '');
    if (request.method === 'POST' && append) { send(await ledger.append(await readEvidenceJson(request), append[1])); return true; }
    const read = /^\/capture\/([a-f0-9-]{36})\/(start|backend|terminal|terminal-error|raw-[0-9]|late-(?:error-)?[0-9]{1,2})$/.exec(request.url ?? '');
    if (request.method === 'GET' && read) { send(await ledger.read(read[1], read[2])); return true; }
    return false;
  };
}

