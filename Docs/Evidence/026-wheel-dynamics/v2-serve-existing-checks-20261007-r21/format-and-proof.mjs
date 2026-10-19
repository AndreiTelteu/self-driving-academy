import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import * as prettier from 'prettier';
import { paths, wx, run, digest } from './runner-v3.mjs';
const start=new Date().toISOString();
const contract=readFileSync(paths[0],'utf8');
if(contract.split('v2-serve-existing-source20').length!==2) throw Error('Unexpected PROOF_ROOT replacement count');
writeFileSync(paths[0],contract.replace('v2-serve-existing-source20','v2-serve-existing-source21'));
wx('proof-root-revision.json',{start,end:new Date().toISOString(),file:paths[0],oldDirectory:'v2-serve-existing-source20',newDirectory:'v2-serve-existing-source21',replacementCount:1,authorized:'Formatting-only provenance pack revision'});
if(!run('format-write',['F:/Sites/self-driving-academy/node_modules/prettier/bin/prettier.cjs','--write',...paths])) process.exit(1);
for(let i=0;i<paths.length;i++) {
 const before=readFileSync(resolve('Docs/Evidence/026-wheel-dynamics/v2-serve-existing-checks-20261007-r21',`before-${i}.mjs`),'utf8');
 const expected=await prettier.format(i===0?before.replace('v2-serve-existing-source20','v2-serve-existing-source21'):before,{...await prettier.resolveConfig(paths[i]),filepath:paths[i]});
 if(readFileSync(paths[i],'utf8')!==expected) throw Error('Additional semantic/source difference');
 wx(`after-${i}.mjs`,readFileSync(paths[i]));
}
wx('format-equivalence.json',{state:'PASS',files:paths,criterion:'Actual bytes equal existing Prettier(config) applied to original SOURCE20; contract alone has exactly one authorized PROOF_ROOT directory replacement. No other logic changes.'});
const root=resolve('Docs/Evidence/026-wheel-dynamics/v2-serve-existing-source21');
mkdirSync(root);
const item=p=> {const b=readFileSync(p);return {path:p,absolutePath:resolve(p).replaceAll('\\','/'),bytes:b.length,sha256:digest(b)};};
const proof=JSON.parse(readFileSync('Docs/Evidence/026-wheel-dynamics/v2-serve-existing-source20/service-proof.json'));
proof.files=paths.slice(0,2).map(item);
proof.draftedTests=[item(paths[2])];
proof.runtimeBytes=proof.files.reduce((n,f)=>n+f.bytes,0);
for(const p of paths) {const dest=resolve(root,'source',p);mkdirSync(resolve(dest,'..'),{recursive:true});const b=readFileSync(p);writeFileSync(dest,b,{flag:'wx'});if(!readFileSync(dest).equals(b))throw Error('Snapshot readback');}
const proofBytes=Buffer.from(JSON.stringify(proof,null,2)+'\n');
writeFileSync(resolve(root,'service-proof.json'),proofBytes,{flag:'wx'});
if(!readFileSync(resolve(root,'service-proof.json')).equals(proofBytes)) throw Error('Proof readback');
const proofHash=digest(proofBytes);
wx('service-proof-source21.json',proofBytes);
wx('source21-pins.json',{state:'FORMAT_ONLY_PROVENANCE_REVISION',createdAt:new Date().toISOString(),proofRoot:root.replaceAll('\\','/'),serviceProofSha256:proofHash,files:paths.map(item),originalSource20Untouched:true,exactManifestPath:JSON.parse(readFileSync('Docs/Evidence/026-wheel-dynamics/v2-serve-existing-source20/source20-final-manifest.json')).exactManifestPath});
console.log(JSON.stringify({proofHash,proofRoot:root,files:proof.files}));