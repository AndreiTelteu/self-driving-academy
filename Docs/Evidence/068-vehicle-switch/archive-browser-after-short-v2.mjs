import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const cwd = resolve('.').replaceAll('\\', '/');
assert.equal(cwd, 'F:/Sites/self-driving-academy/.worktrees/vehicle-switch-01');
assert.equal(
  execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(),
  'loop-pbi/vehicle-switch-01',
);
const folder = 'Docs/Evidence/068-vehicle-switch/browser-after-short-v2-01',
  build = '.pbi-validation-068/build-after-short-v2-01';
const entries = JSON.parse(
  execFileSync(
    'python',
    [
      '-c',
      `import sys,zipfile,pathlib,hashlib,json
root=pathlib.Path(sys.argv[1]); target=pathlib.Path(sys.argv[2]); rows=[]
with zipfile.ZipFile(target,'x',compression=zipfile.ZIP_DEFLATED) as archive:
 for path in sorted(root.rglob('*')):
  if path.is_file():
   data=path.read_bytes(); name=path.relative_to(root).as_posix(); archive.writestr(name,data); rows.append(dict(path=name,bytes=len(data),sha256=hashlib.sha256(data).hexdigest()))
print(json.dumps(rows))`,
      build,
      folder + '/build-at-capture.zip',
    ],
    { encoding: 'utf8' },
  ),
);
const bytes = await readFile(folder + '/build-at-capture.zip');
await writeFile(
  folder + '/build-archive.json',
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      archiveBytes: bytes.length,
      archiveSha256: createHash('sha256').update(bytes).digest('hex'),
      entries,
    },
    null,
    2,
  ),
  { flag: 'wx' },
);
console.log(JSON.stringify({ status: 'ARCHIVED', entries: entries.length, bytes: bytes.length }));
