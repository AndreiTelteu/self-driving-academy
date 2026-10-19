import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';
import { readCurrentNative } from '../../../../tests/browser/wheel-dynamics-v2/numeric-reader.mjs';
const dir = resolve('Docs/Evidence/026-wheel-dynamics/v2-build-only-checks-20261007-r18');
const sha = b => createHash('sha256').update(b).digest('hex');
const wx = (name, value) => writeFile(resolve(dir, name), typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2), { flag: 'wx' });
const need = (ok, label) => { if (!ok) throw new Error(label); };
const pin = async path => { const b = await readFile(path); return { path, bytes: b.length, sha256: sha(b) }; };
await mkdir(dir, { recursive: true });
await wx('attempt-started.json', { at: new Date().toISOString(), cwd: process.cwd(), command: 'node tests/browser/wheel-dynamics-v2/server.mjs 5220 --build-only', maximumBuildInvocations: 1 });
let invoked = false;
try {
  need(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() === 'e52e10b1170db7b8882d6581bdbd4027d2149fb6', 'HEAD mismatch');
  need(execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim() === 'loop-pbi/wheel-dynamics-01', 'branch mismatch');
  const logPin = await pin('Docs/Evidence/026-wheel-dynamics/current-native-browser-checks-20261007-r17/log-pins.json');
  need(logPin.sha256 === 'b72befd8dcf6de73431e1005929ac7a4dd10eb27f49fbdeedd0881d346ee9a76', 'R17 log pin mismatch');
  const before = await readCurrentNative();
  await wx('prebuild-reader.json', { checkedAt: new Date().toISOString(), pins: before.pins, r17: logPin, afterRuns: before.after.runs.length, calibrationRuns: before.calibration.runs.length, source: await pin('tests/browser/wheel-dynamics-v2/server.mjs') });
  const guard = execFileSync('powershell.exe', ['-NoProfile', '-Command', "$p026 = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(node|chrome|msedge)\\.exe$' } | Select-Object ProcessId,ParentProcessId,Name,CommandLine); $l026 = @(Get-NetTCPConnection -State Listen -LocalPort 5220 -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess); [ordered]@{capturedAt=(Get-Date -Format o); processes=$p026; port5220Listeners=$l026} | ConvertTo-Json -Depth 5 -Compress"], { encoding: 'utf8' });
  await wx('process-guard.json', guard);
  const g = JSON.parse(guard);
  need(g.port5220Listeners.length === 0, 'Port5220 listener already exists');
  need(!g.processes.some(p => p.Name === 'node.exe' && /(?:benchmark-wheel|calibrate-wheel|tests[\\/]browser[\\/].*server\.mjs)/.test(p.CommandLine ?? '')), 'Active fixture/measurement Node process');
  await wx('build-start.json', { at: new Date().toISOString(), command: 'node tests/browser/wheel-dynamics-v2/server.mjs 5220 --build-only', grant: 'parent-serial-review-approved', readerVerifiedBeforeBuild: true });
  process.env.PBI026_V2_EXECUTION_GRANT = 'parent-serial-review-approved';
  let stdout = [], stderr = [], result;
  try {
    invoked = true;
    result = await new Promise((res, rej) => {
      const child = spawn('node', ['tests/browser/wheel-dynamics-v2/server.mjs', '5220', '--build-only'], { cwd: process.cwd(), env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.on('data', b => stdout.push(b));
      child.stderr.on('data', b => stderr.push(b));
      child.on('error', rej);
      child.on('close', (code, signal) => res({ code, signal }));
    });
  } finally {
    delete process.env.PBI026_V2_EXECUTION_GRANT;
    await wx('build.stdout.log', Buffer.concat(stdout));
    await wx('build.stderr.log', Buffer.concat(stderr));
    await wx('build-exit.json', { at: new Date().toISOString(), ...result, grantRemoved: !Object.hasOwn(process.env, 'PBI026_V2_EXECUTION_GRANT'), buildInvocations: 1 });
  }
  need(result.code === 0, 'Build exited nonzero; no retry');
  const line = Buffer.concat(stdout).toString('utf8').split(/\r?\n/).find(x => x.startsWith('{"state":"BUILD_ARCHIVED_SERVER_NOT_STARTED"'));
  need(line, 'Missing build-only terminal state');
  const output = JSON.parse(line), binding = output.bindingIdentity, archive = output.archive;
  const buildUUID = archive.match(/-([a-f0-9]{8}-[a-f0-9-]{27})$/)?.[1];
  need(buildUUID, 'Missing UUID');
  const root = resolve('.pbi-validation-026-v2', 'build-' + buildUUID);
  const manifestBytes = await readFile(resolve(root, 'build-manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  need(manifestBytes.equals(await readFile(resolve(archive, 'build-manifest.json'))), 'Manifest byte identity');
  need(JSON.stringify(JSON.parse(await readFile(resolve(archive, 'archive-complete.json')))) === JSON.stringify(binding), 'Completion binding');
  need(manifest.sourceHash === binding.sourceHash && manifest.artifactHash === binding.artifactHash, 'Manifest binding');
  need(sha(Buffer.from(JSON.stringify(manifest.artifacts))) === manifest.artifactHash, 'Aggregate artifact hash');
  const sources = [], artifacts = [];
  const aggregate = createHash('sha256');
  for (const path of manifest.inputs) {
    const bytes = await readFile(path), archived = await readFile(resolve(archive, 'source', path));
    need(bytes.equals(archived), 'Source byte identity: ' + path);
    aggregate.update(path).update(bytes);
    sources.push({ path, bytes: bytes.length, sha256: sha(bytes) });
  }
  need(aggregate.digest('hex') === manifest.sourceHash, 'Aggregate source hash');
  for (const item of manifest.artifacts) {
    const bytes = await readFile(resolve(root, item.path));
    need(bytes.equals(await readFile(resolve(archive, 'build', item.path))) && bytes.length === item.bytes && sha(bytes) === item.sha256, 'Artifact identity: ' + item.path);
    artifacts.push(item);
  }
  const current = await readCurrentNative();
  need(JSON.stringify(current.pins) === JSON.stringify(before.pins) && JSON.stringify(binding.currentNative) === JSON.stringify(before.pins), 'All reviewed pins binding/unchanged');
  for (const path of [current.after.native.resolvedPath, current.after.native.archive, current.calibration.native.archive, resolve(archive, 'native/rapier-native-artifact.mjs')]) {
    const p = await pin(path);
    need(p.bytes === binding.native.bytes && p.sha256 === binding.native.sha256, 'Native byte identity: ' + path);
  }
  const hardware = await readFile(resolve(root, 'hardware.json'));
  need(hardware.equals(await readFile(resolve(archive, 'hardware.json'))) && hardware.length === binding.hardware.bytes && sha(hardware) === binding.hardware.sha256, 'Hardware metadata byte identity');
  const completed = await stat(resolve(archive, 'archive-complete.json'));
  const started = await stat(resolve(archive, 'archive-started.json'));
  const buildManifest = await stat(resolve(root, 'build-manifest.json'));
  need(started.mtimeMs <= completed.mtimeMs && buildManifest.mtimeMs <= completed.mtimeMs, 'Build/archive completion chronology');
  await wx('source-pins.json', sources);
  await wx('artifact-pins.json', artifacts);
  const verification = { state: 'BUILD_ONLY_INDEPENDENT_VERIFY_PASS', verifiedAt: new Date().toISOString(), buildUUID, buildPath: root, archivePath: archive, manifestPath: resolve(archive, 'build-manifest.json'), manifest: await pin(resolve(archive, 'build-manifest.json')), archiveComplete: await pin(resolve(archive, 'archive-complete.json')), sourceCount: sources.length, sourceBytes: sources.reduce((s,x) => s+x.bytes,0), artifactCount: artifacts.length, artifactBytes: artifacts.reduce((s,x) => s+x.bytes,0), sourceHash: binding.sourceHash, artifactHash: binding.artifactHash, native: binding.native, hardware: binding.hardware, currentPins: current.pins, chronology: { prebuildReader: JSON.parse(await readFile(resolve(dir, 'prebuild-reader.json'))).checkedAt, buildStarted: JSON.parse(await readFile(resolve(dir, 'build-start.json'))).at, manifestWritten: buildManifest.mtime.toISOString(), archiveStarted: started.mtime.toISOString(), archiveCompleted: completed.mtime.toISOString(), buildExited: JSON.parse(await readFile(resolve(dir, 'build-exit.json'))).at }, grantRemoved: true, acceptance: 'BUILD_ONLY_NO_BROWSER_OR_HARDWARE_ACCEPTANCE', normalServerWillRebuildWithAnotherUUID: true };
  await wx('verification.json', verification);
  await wx('REPORT.md', '# R18 single build-only verification\n\nPASS: exactly one authorized build invocation exited 0 with BUILD_ARCHIVED_SERVER_NOT_STARTED. Independent read-only verification passed current/archived source, emitted artifacts, native and hardware metadata byte identities, aggregate hashes and all four reviewed native pins. The offline reader ran before the build and again afterward; build/archive chronology is recorded in verification.json. Grant removed in finally. No server/listener was created by the build-only entry, no HTTP request, UI/browser, native initialization/world/probe/calibration/capture, source repair, Git write, board movement or child task was performed.\n\nThis is build-only acceptance; no live Chrome or hardware acceptance. A future normal server invocation WILL rebuild with another UUID. Parent can plan a separately reviewed serve-existing frozen-identity helper; none was implemented or launched here. PBI026 is not Done.\n\nExact paths, counts, byte totals, hashes, UUID and current pins:\n\n```json\n' + JSON.stringify(verification, null, 2) + '\n```\n');
  console.log(JSON.stringify(verification, null, 2));
} catch (error) {
  delete process.env.PBI026_V2_EXECUTION_GRANT;
  await wx('failure.json', { state: 'FAILED_STOP_NO_RETRY', at: new Date().toISOString(), buildInvoked: invoked, grantRemoved: !Object.hasOwn(process.env, 'PBI026_V2_EXECUTION_GRANT'), name: error?.name, message: error?.message, stack: error?.stack });
  console.error(error);
  process.exitCode = 1;
} finally {
  const logs = [];
  for (const name of (await readdir(dir)).sort()) if (name !== 'log-pins.json') logs.push(await pin(resolve(dir, name)));
  await wx('log-pins.json', logs);
}
