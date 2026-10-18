import assert from 'node:assert/strict';
import { verifyBuild } from './build-binding.mjs';
assert.equal(process.argv.length, 3);
const b = await verifyBuild(process.argv[2], false);
console.log(JSON.stringify({status:'BUILD_ONLY_PASS',fixtureRevision:b.fixtureRevision,buildUUID:b.buildUUID,sourceHash:b.sourceHash,artifactHash:b.artifactHash,nativeHash:b.nativeHash,inputs:b.inputs.length,artifacts:b.artifacts.length,zip:b.zip,hardwareAcceptance:false}));
