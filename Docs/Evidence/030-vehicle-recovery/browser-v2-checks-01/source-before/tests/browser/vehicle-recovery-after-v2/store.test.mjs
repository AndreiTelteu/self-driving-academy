import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,relative,basename,isAbsolute,join} from 'node:path';
import {createFunctionalStore} from './functional-store.mjs';
async function fixture(run) {
  const root=await mkdtemp(join(tmpdir(),'030-functional-v2-unit-'));
  try {await run({functionalRoot:root,sourceHash:'a'.repeat(64),artifactHash:'b'.repeat(64),nativeHash:'c'.repeat(64),buildUUID:'11111111-1111-4111-8111-111111111111',archivedAt:'2026-10-07T00:00:00.000Z'});}
  finally {
    const resolved=resolve(root), rel=relative(resolve(tmpdir()),resolved);
    assert(rel&&!rel.startsWith('..')&&!isAbsolute(rel)&&basename(resolved).startsWith('030-functional-v2-unit-'));
    await rm(resolved,{recursive:true});
  }
}
const startData=b=>({preference:'AUTO',sourceHash:b.sourceHash,artifactHash:b.artifactHash,nativeHash:b.nativeHash,buildUUID:b.buildUUID});
test('new namespace still permits only one attempt/backend; duplicate remains rejected without overwriting first raw', async()=>fixture(async build=>{
  const store=await createFunctionalStore(build), data=startData(build), first=await store.start(data);
  const path=join(build.functionalRoot,first.captureId,'start-submitted.json'), original=await readFile(path);
  await new Promise(resolve=>setTimeout(resolve,2));
  await assert.rejects(()=>store.start(data),/One immutable functional attempt/);
  assert.deepEqual(await readFile(path),original);
}));
test('foreign build UUID in submitted report is retained before rejection, never accepted as fresh success', async()=>fixture(async build=>{
  const store=await createFunctionalStore(build), first=await store.start(startData(build));
  const report={status:'INCOMPLETE',identity:{captureId:first.captureId,backend:first.backend,sourceHash:build.sourceHash,artifactHash:build.artifactHash,nativeHash:build.nativeHash,buildUUID:'22222222-2222-4222-8222-222222222222'}};
  const raw=Buffer.from(JSON.stringify(report));
  await assert.rejects(()=>store.receive(first.captureId,'report',raw));
  assert.deepEqual(await readFile(join(build.functionalRoot,first.captureId,'submitted.json')),raw);
  await assert.rejects(()=>readFile(join(build.functionalRoot,first.captureId,'complete.json')));
}));
