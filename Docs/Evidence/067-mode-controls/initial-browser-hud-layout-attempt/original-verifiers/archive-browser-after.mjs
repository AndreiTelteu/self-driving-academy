// Durable actual emitted build bytes; run only after the approved frozen browser build.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const folder='Docs/Evidence/067-mode-controls/browser-after',root='.pbi-validation-067/build-after';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
await mkdir(folder,{recursive:true});
for(const path of ['build-at-capture.zip','build-archive.json'])await assert.rejects(access(`${folder}/${path}`));
const manifestBytes=await readFile(`${root}/build-manifest.json`),hardwareBytes=await readFile(`${root}/hardware.json`),manifest=JSON.parse(manifestBytes);
const entries=[...manifest.artifacts,{path:'build-manifest.json',bytes:manifestBytes.length,sha256:hash(manifestBytes)},{path:'hardware.json',bytes:hardwareBytes.length,sha256:hash(hardwareBytes)}];
for(const entry of entries){const bytes=await readFile(`${root}/${entry.path}`);assert.equal(bytes.length,entry.bytes);assert.equal(hash(bytes),entry.sha256);}
execFileSync('powershell.exe',['-NoProfile','-Command',"Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory([IO.Path]::GetFullPath('.pbi-validation-067/build-after'),[IO.Path]::GetFullPath('Docs/Evidence/067-mode-controls/browser-after/build-at-capture.zip'))"],{stdio:'pipe'});
const actualEntries=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command',"[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); Add-Type -AssemblyName System.IO.Compression.FileSystem; $zip067=[IO.Compression.ZipFile]::OpenRead([IO.Path]::GetFullPath('Docs/Evidence/067-mode-controls/browser-after/build-at-capture.zip')); try { $rows067=@(); foreach($entry067 in $zip067.Entries){if(!$entry067.Name){continue};$stream067=$entry067.Open();try{$sha067=[Security.Cryptography.SHA256]::Create();$digest067=[BitConverter]::ToString($sha067.ComputeHash($stream067)).Replace('-','').ToLowerInvariant();$sha067.Dispose()}finally{$stream067.Dispose()};$rows067 += [ordered]@{path=$entry067.FullName.Replace('\\','/');bytes=$entry067.Length;sha256=$digest067}};ConvertTo-Json -InputObject $rows067 -Depth 5 -Compress }finally{$zip067.Dispose()}"],{encoding:'utf8'}));
assert.equal(actualEntries.length,entries.length);for(const entry of entries)assert.deepEqual(actualEntries.find(e=>e.path===entry.path),entry);
for(const [path,bytes] of [['build-manifest.json',manifestBytes],['hardware.json',hardwareBytes]]){try{const previous=await readFile(`${folder}/${path}`);assert.deepEqual(previous,bytes);}catch(error){if(error.code!=='ENOENT')throw error;await writeFile(`${folder}/${path}`,bytes,{flag:'wx'});}}
const zip=await readFile(`${folder}/build-at-capture.zip`);
await writeFile(`${folder}/build-archive.json`,JSON.stringify({archivedAt:new Date().toISOString(),archiveBytes:zip.length,archiveSha256:hash(zip),sourceHash:manifest.sourceHash,artifactHash:manifest.artifactHash,entries:actualEntries,note:'Actual emitted build bytes independently decompressed and every length/SHA matched; metadata included.'},null,2),{flag:'wx'});
console.log(JSON.stringify({status:'PASS',sourceHash:manifest.sourceHash,artifactHash:manifest.artifactHash,entries:actualEntries.length,archiveSha256:hash(zip)}));
