import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
function scan(folder) {
  const files = readdirSync(folder, { recursive: true }).filter((file) => file.endsWith('.js'));
  const maps = readdirSync(folder, { recursive: true }).filter((file) => file.endsWith('.js.map'));
  assert(maps.length > 0, `No emitted sourcemaps in ${folder}; build with --sourcemap`);
  const sources = maps.flatMap(
    (file) => JSON.parse(readFileSync(join(folder, file), 'utf8')).sources,
  );
  const inspectorSources = sources.filter((source) => source.includes('/@babylonjs/inspector/'));
  assert(
    sources.some((source) => source.endsWith('/diagnostics-adapter.ts')),
    `Diagnostics adapter absent from emitted graph: ${folder}`,
  );
  if (folder === resolve('dist'))
    assert(
      sources.some((source) => source.endsWith('/src/main.ts')),
      'Application main.ts absent from emitted production graph',
    );
  return {
    folder,
    jsFiles: files.length,
    sourceMaps: maps.length,
    jsBytes: files.reduce((sum, file) => sum + readFileSync(join(folder, file)).length, 0),
    inspectorSources: inspectorSources.length,
    debugSourcePresent: sources.some((source) => source.endsWith('/dev-inspector.ts')),
  };
}
const production = scan(resolve('dist'));
const fixture = scan(resolve('.pbi-validation-019/final'));
const development = scan(resolve('.pbi-validation-019/development'));
assert.equal(production.inspectorSources, 0, 'Inspector bundled into production application');
assert.equal(
  production.debugSourcePresent,
  false,
  'Unused dev inspector code survives production application',
);
assert.equal(fixture.inspectorSources, 0, 'Inspector bundled into production fixture');
assert(development.inspectorSources > 0, 'Development fixture did not include real Inspector');
writeFileSync(
  'Docs/Evidence/019-diagnostics/bundle.json',
  JSON.stringify(
    {
      production,
      fixture,
      development,
      result: 'PASS',
      method:
        'All generated JS sourcemap source lists; package presence rather than sourceContent literal strings',
    },
    null,
    2,
  ),
);
console.log('Diagnostics production inspector exclusion: PASS');
