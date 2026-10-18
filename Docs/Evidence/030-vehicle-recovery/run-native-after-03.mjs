import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const root = 'F:/Sites/self-driving-academy/.worktrees/vehicle-recovery-01';
assert.equal(process.cwd().replaceAll('\\', '/'), root);
assert.equal(execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(), 'loop-pbi/vehicle-recovery-01');
const ns = 'Docs/Evidence/030-vehicle-recovery/native-after-checks-03';
await mkdir(ns);
const commands = [
  ['format-launcher', ['F:/Sites/self-driving-academy/node_modules/prettier/bin/prettier.cjs', '--write', 'tests/browser/vehicle-recovery-after.mjs']],
  ['format-launcher-check', ['F:/Sites/self-driving-academy/node_modules/prettier/bin/prettier.cjs', '--check', 'tests/browser/vehicle-recovery-after.mjs']],
  ['syntax-launcher', ['--check', 'tests/browser/vehicle-recovery-after.mjs']],
  ['loader-url-no-world', ['--import', 'file:///F:/Sites/self-driving-academy/.worktrees/vehicle-recovery-01/scripts/register-typescript.mjs', '--input-type=module', '--eval', 'import {createStableId} from "./src/sessions/identity.ts"; console.log(createStableId("loader-probe","030",["no-native-world"]));']],
  ['one-native-after', ['--import', './scripts/register-typescript.mjs', 'tests/browser/vehicle-recovery-after.mjs']],
  ['after-current', ['--import', './scripts/register-typescript.mjs', 'tests/browser/vehicle-recovery/verify-after.mjs', 'Docs/Evidence/030-vehicle-recovery/after-02']],
  ['after-historical', ['--import', './scripts/register-typescript.mjs', 'tests/browser/vehicle-recovery/verify-after.mjs', 'Docs/Evidence/030-vehicle-recovery/after-02', '--historical']],
];
for (const [label, args] of commands) {
  let stdout = '', stderr = '', exit = 0;
  const startedAt = new Date().toISOString();
  console.log(JSON.stringify({ label, startedAt, phase: 'COMMAND_STARTED' }));
  try {
    const result = await promisify(execFile)(process.execPath, args, { cwd: root, maxBuffer: 16 * 1024 * 1024 });
    stdout = result.stdout; stderr = result.stderr;
  } catch (error) {
    stdout = error.stdout ?? ''; stderr = error.stderr ?? String(error); exit = Number.isInteger(error.code) ? error.code : 1;
  }
  const finishedAt = new Date().toISOString();
  await writeFile(`${ns}/${label}.stdout.txt`, stdout, { flag: 'wx' });
  await writeFile(`${ns}/${label}.stderr.txt`, stderr, { flag: 'wx' });
  await writeFile(`${ns}/${label}.json`, JSON.stringify({ command: process.execPath, args, workdir: root, startedAt, finishedAt, exit }, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ label, finishedAt, exit }));
  if (exit) { process.exitCode = exit; break; }
}
