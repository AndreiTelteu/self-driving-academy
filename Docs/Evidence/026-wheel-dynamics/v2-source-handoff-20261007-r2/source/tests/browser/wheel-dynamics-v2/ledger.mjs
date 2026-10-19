import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { EvidenceTransportError } from './transport.mjs';

export const PROTOCOL = '026-wheel-dynamics-v2-source-ownership-1';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const uuid = (value) => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);
function requireThat(condition, message) {
  if (!condition) throw new EvidenceTransportError(400, message);
}
export function createLedger(destination, frozenIdentity, verifyFrozen, filesystem = { mkdir, readFile, writeFile }) {
  const { mkdir, readFile, writeFile } = filesystem;
  let queue = Promise.resolve();
  const serial = (operation) => {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  };
  const envelope = (binding, kind, dto) => {
    const payload = JSON.stringify({ binding, kind, dto });
    return { payload, sha256: digest(payload), bytes: Buffer.byteLength(payload) };
  };
  const read = async (captureId, name) => {
    requireThat(uuid(captureId) && /^(start|backend|terminal|terminal-error|raw-[0-9]|late-(error-)?[0-9]{1,2})$/.test(name), 'Invalid ledger locator');
    const archived = JSON.parse(await readFile(resolve(destination, captureId, `${name}.json`), 'utf8'));
    requireThat(archived.sha256 === digest(archived.payload) && archived.bytes === Buffer.byteLength(archived.payload), 'Archived ledger bytes changed');
    const payload = JSON.parse(archived.payload);
    requireThat(payload.binding.captureId === captureId && payload.binding.protocol === PROTOCOL && payload.kind === name, 'Archived identity mismatch');
    return { ...archived, record: payload };
  };
  const persist = async (binding, name, dto) => {
    const archived = envelope(binding, name, dto);
    const path = resolve(destination, binding.captureId, `${name}.json`);
    try { await writeFile(path, JSON.stringify(archived), { flag: 'wx' }); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const existing = await read(binding.captureId, name);
      if (existing.sha256 !== archived.sha256) throw new EvidenceTransportError(409, 'Conflicting immutable DTO');
    }
    const stored = await read(binding.captureId, name);
    return { captureId: binding.captureId, name, sha256: stored.sha256, bytes: stored.bytes };
  };
  return {
    read,
    start: (dto) => serial(async () => {
      requireThat(uuid(dto.launchKey) && ['AUTO', 'WEBGL2'].includes(dto.requestedBackend) &&
        ['full', 'smoke', 'diagnostic'].includes(dto.mode), 'Invalid start DTO');
      await verifyFrozen();
      await mkdir(destination, { recursive: true });
      const keyPath = resolve(destination, `launch-${dto.launchKey}.json`);
      let binding;
      try { binding = JSON.parse(await readFile(keyPath, 'utf8')); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        binding = { ...frozenIdentity, protocol: PROTOCOL, captureId: randomUUID(), issuedAt: new Date().toISOString(),
          launchKey: dto.launchKey, requestedBackend: dto.requestedBackend, mode: dto.mode };
        await writeFile(keyPath, JSON.stringify(binding), { flag: 'wx' });
      }
      requireThat(binding.requestedBackend === dto.requestedBackend && binding.mode === dto.mode &&
        Object.keys(frozenIdentity).every(key => JSON.stringify(binding[key]) === JSON.stringify(frozenIdentity[key])),
        'Launch binding conflict');
      await mkdir(resolve(destination, binding.captureId), { recursive: true });
      return { binding, acknowledgment: await persist(binding, 'start', dto) };
    }),
    append: (dto, name) => serial(async () => {
      const start = await read(dto.binding?.captureId, 'start');
      requireThat(JSON.stringify(dto.binding) === JSON.stringify(start.record.binding), 'Bound DTO identity mismatch');
      requireThat(['WEBGPU', 'WEBGL2', null].includes(dto.renderer), 'Invalid actual backend');
      if (dto.binding.requestedBackend === 'WEBGL2') requireThat(dto.renderer === 'WEBGL2' || dto.renderer === null, 'Backend mismatch');
      if (/^late-(error-)?[0-9]{1,2}$/.test(name) || name === 'terminal-error') {
        requireThat(dto.state === 'FAILED_UNKNOWN' && (name === 'terminal-error' ||
          Number(name.split('-').at(-1)) < 64 && Number.isInteger(dto.armIndex) && dto.armIndex >= 0 && dto.armIndex < 10),
          'Invalid supplemental late record');
        if (dto.renderer !== null) {
          const backend = await read(dto.binding.captureId, 'backend');
          requireThat(dto.renderer === backend.record.dto.renderer, 'Late actual backend mismatch');
        }
        // Diagnostic supplements never award acceptance. Preserve observed drift as a server cause.
        let frozenStatus = 'UNCHANGED';
        try { await verifyFrozen(); } catch (error) { frozenStatus = `FAILED_UNKNOWN: ${String(error).slice(0, 1024)}`; }
        return persist(dto.binding, name, { ...dto, frozenStatus });
      }
      await verifyFrozen();
      if (name !== 'terminal') {
        try {
          await read(dto.binding.captureId, 'terminal');
          // Only byte-identical retries of an already acknowledged record may follow terminal.
          const existing = await read(dto.binding.captureId, name);
          requireThat(existing.sha256 === envelope(dto.binding, name, dto).sha256, 'New record after terminal');
        } catch (error) { if (error.code !== 'ENOENT') throw error;
          try { await read(dto.binding.captureId, 'terminal'); throw new EvidenceTransportError(409, 'New record after terminal'); }
          catch (terminalError) { if (terminalError.code !== 'ENOENT') throw terminalError; }
        }
      }
      if (name === 'backend') {
        requireThat(['WEBGPU', 'WEBGL2'].includes(dto.renderer), 'Backend acquisition missing');
        return persist(dto.binding, name, dto);
      }
      if (dto.renderer !== null) {
        try {
          const backend = await read(dto.binding.captureId, 'backend');
          requireThat(dto.renderer === backend.record.dto.renderer, 'Actual backend changed during capture');
        } catch (error) {
          if (!(error.code === 'ENOENT' && name === 'terminal' && dto.state === 'INCOMPLETE')) throw error;
        }
      }
      if (name.startsWith('raw-')) {
        requireThat(['frames', 'ticks'].every(key => Number.isInteger(dto[key]) && dto[key] >= 0 && dto[key] <= 30000), 'Invalid raw counts');
        requireThat(dto.armIndex === Number(name.slice(4)) && dto.armIndex >= 0 && dto.armIndex < 10, 'Raw arm mismatch');
        for (const [channel, values] of Object.entries(dto.channels ?? {})) {
          requireThat(['frame', 'main', 'tick', 'projection', 'step'].includes(channel) && Array.isArray(values) &&
            values.length <= 30000 && values.every(Number.isFinite), 'Invalid raw channel');
          requireThat(values.length === (['tick', 'step'].includes(channel) ? dto.ticks : dto.frames), 'Raw count mismatch');
        }
        requireThat(Object.keys(dto.channels ?? {}).length === 5, 'Missing raw channels');
      } else {
        requireThat(name === 'terminal' && ['INCOMPLETE', 'CAPTURE_COMPLETE', 'DIAGNOSTIC_COMPLETE', 'SMOKE_COMPLETE'].includes(dto.state), 'Invalid terminal');
        requireThat(dto.acceptance === 'UNVERIFIED', 'Server never awards acceptance');
        if (dto.state === 'CAPTURE_COMPLETE') {
          requireThat(dto.binding.mode === 'full' && dto.report?.runs?.length === 10 && dto.report?.calibration?.length === 8, 'Incomplete full terminal');
          for (let index = 0; index < 10; index++) {
            const raw = (await read(dto.binding.captureId, `raw-${index}`)).record.dto;
            const run = dto.report.runs[index];
            requireThat(raw.frames === run.frames && raw.ticks === run.ticks && raw.current === run.current && raw.pair === run.pair, 'Terminal raw count/order tamper');
          }
        }
      }
      return persist(dto.binding, name, dto);
    }),
  };
}

/** Historical reads use their own archived binding and bytes, never current identity. */
export async function readPortableCapture(directory) {
  const read = async (name) => {
    const archived = JSON.parse(await readFile(resolve(directory, `${name}.json`), 'utf8'));
    if (digest(archived.payload) !== archived.sha256 || Buffer.byteLength(archived.payload) !== archived.bytes)
      throw new Error(`Corrupt ${name}`);
    const record = JSON.parse(archived.payload);
    if (record.kind !== name) throw new Error(`Archived kind changed: ${name}`);
    return record;
  };
  const start = await read('start');
  if (start.binding.protocol !== PROTOCOL || !uuid(start.binding.captureId)) throw new Error('Unknown capture protocol');
  if (!/^build-[a-f0-9]{64}-[a-f0-9]{64}-[a-f0-9-]{36}$/.test(start.binding.archive)) throw new Error('Invalid build archive locator');
  const archive = resolve(dirname(directory), start.binding.archive);
  const manifest = JSON.parse(await readFile(resolve(archive, 'build-manifest.json'), 'utf8'));
  const complete = JSON.parse(await readFile(resolve(archive, 'archive-complete.json'), 'utf8'));
  if (manifest.sourceHash !== start.binding.sourceHash || manifest.artifactHash !== start.binding.artifactHash ||
    JSON.stringify(manifest.inputs) !== JSON.stringify(start.binding.inputs) ||
    new Set(manifest.inputs).size !== manifest.inputs.length) throw new Error('Archive manifest mismatch');
  if (complete.sourceHash !== start.binding.sourceHash || complete.artifactHash !== start.binding.artifactHash ||
    JSON.stringify(complete.native) !== JSON.stringify(start.binding.native)) throw new Error('Incomplete/mixed archive identity');
  const source = createHash('sha256');
  for (const input of manifest.inputs) {
    if (input.includes('..') || input.startsWith('/') || input.includes(':')) throw new Error('Invalid archived source path');
    source.update(input).update(await readFile(resolve(archive, 'source', input)));
  }
  if (source.digest('hex') !== start.binding.sourceHash) throw new Error('Archived source bytes changed');
  if (digest(JSON.stringify(manifest.artifacts)) !== start.binding.artifactHash) throw new Error('Archived artifact index changed');
  for (const item of manifest.artifacts) {
    if (item.path.includes('..') || item.path.startsWith('/') || item.path.includes(':')) throw new Error('Invalid artifact path');
    const bytes = await readFile(resolve(archive, 'build', item.path));
    if (bytes.length !== item.bytes || digest(bytes) !== item.sha256) throw new Error('Archived artifact bytes changed');
  }
  const native = await readFile(resolve(archive, 'native/rapier-native-artifact.mjs'));
  if (native.length !== start.binding.native.bytes || digest(native) !== start.binding.native.sha256)
    throw new Error('Archived native bytes changed');
  const hardware = await readFile(resolve(archive, 'hardware.json'));
  if (hardware.length !== start.binding.hardware?.bytes || digest(hardware) !== start.binding.hardware?.sha256)
    throw new Error('Archived hardware bytes changed');
  let terminal = null;
  try { terminal = await read('terminal'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const raw = [];
  const late = [];
  try { late.push(await read('terminal-error')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (let index = 0; index < 64; index++) {
    try { late.push(await read(`late-${index}`)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { late.push(await read(`late-error-${index}`)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  let backend = null;
  try { backend = await read('backend'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (let arm = 0; arm < 10; arm++) {
    try { raw.push(await read(`raw-${arm}`)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  for (const item of [...raw, ...late, ...(terminal ? [terminal] : []), ...(backend ? [backend] : [])])
    if (JSON.stringify(item.binding) !== JSON.stringify(start.binding)) throw new Error('Mixed capture identity');
  for (const item of [...raw, ...(terminal ? [terminal] : [])])
    if (item.dto.renderer !== null && item.dto.renderer !== backend?.dto.renderer &&
      !(item.kind === 'terminal' && item.dto.state === 'INCOMPLETE' && !backend)) throw new Error('Mixed actual backend');
  for (const { dto, kind } of raw) {
    if (kind !== `raw-${dto.armIndex}` || Object.keys(dto.channels).length !== 5 ||
      !['frame','main','tick','projection','step'].every(key => Array.isArray(dto.channels[key])) ||
      ![dto.frames, dto.ticks].every(count => Number.isInteger(count) && count >= 0 && count <= 30000)) throw new Error('Archived raw schema');
    for (const [channel, values] of Object.entries(dto.channels))
      if (values.length !== (['tick', 'step'].includes(channel) ? dto.ticks : dto.frames) || !values.every(Number.isFinite)) throw new Error('Archived raw count/finite mismatch');
  }
  const completeProtocol = terminal?.dto.state === 'CAPTURE_COMPLETE' && start.binding.mode === 'full' && raw.length === 10 &&
    terminal.dto.report?.runs?.length === 10 && terminal.dto.report?.calibration?.length === 8;
  return { start, backend, terminal, raw, late, state: completeProtocol ? 'RAW_READY' : 'INCOMPLETE',
    rawCounts: raw.map(({ dto }) => ({ arm: dto.armIndex, frames: dto.frames, ticks: dto.ticks })) };
}

