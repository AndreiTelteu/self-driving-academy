$ErrorActionPreference='Stop'
if((Get-Location).Path.Replace('\','/') -ne 'F:/Sites/self-driving-academy/.worktrees/vehicle-recovery-01' -or (git branch --show-current) -ne 'loop-pbi/vehicle-recovery-01'){throw 'Wrong cwd/branch'}
$evidence='Docs/Evidence/030-vehicle-recovery/browser-v2-checks-01'
if(Test-Path -LiteralPath $evidence){throw 'Evidence must be absent'}
New-Item -ItemType Directory -Path $evidence | Out-Null
$paths=@(Get-ChildItem tests/browser/vehicle-recovery-after-v2 -File | Sort-Object Name | ForEach-Object {'tests/browser/vehicle-recovery-after-v2/'+$_.Name})
foreach($path in $paths){$target=Join-Path "$evidence/source-before" $path;New-Item -ItemType Directory -Force -Path (Split-Path $target)|Out-Null;Copy-Item -LiteralPath $path -Destination $target}
$original=Get-Content Docs/Evidence/030-vehicle-recovery/browser-after-01/build-manifest.json -Raw|ConvertFrom-Json
$raw=@(Get-ChildItem Docs/Evidence/030-vehicle-recovery/browser-after-01/functional -Recurse -File | ForEach-Object {@{path=$_.FullName;bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}})
$raw|ConvertTo-Json -Depth 5|Set-Content "$evidence/original-raw-before.json" -Encoding utf8NoBOM
function Guard {
 foreach($row in $original.inputs){if((Get-Item -LiteralPath $row.path).Length -ne $row.bytes -or (Get-FileHash -LiteralPath $row.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $row.sha256){throw "Original source changed $($row.path)"}}
 foreach($row in $raw){if((Get-Item -LiteralPath $row.path).Length -ne $row.bytes -or (Get-FileHash -LiteralPath $row.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $row.sha256){throw 'Original raw changed'}}
}
Guard
function Run([string]$name,[string[]]$arguments){
 $started=[DateTime]::UtcNow.ToString('o'); & node @arguments 1>"$evidence/$name.stdout.txt" 2>"$evidence/$name.stderr.txt"; $code=$LASTEXITCODE
 @{command=@('node')+$arguments;startedAt=$started;completedAt=[DateTime]::UtcNow.ToString('o');exitCode=$code}|ConvertTo-Json -Depth 8|Set-Content "$evidence/$name.json" -Encoding utf8NoBOM
 Write-Output "$name EXIT $code";if($code -ne 0){throw "$name failed; first logs retained"}
}
$bins='F:/Sites/self-driving-academy/node_modules'
Run '01-format-write' (@("$bins/prettier/bin/prettier.cjs",'--write')+$paths)
Run '02-format-check' (@("$bins/prettier/bin/prettier.cjs",'--check')+$paths)
Run '03-pure' @('--import','./scripts/register-typescript.mjs','--test-concurrency=1','--test','tests/browser/vehicle-recovery-after-v2/diagnostic.test.ts','tests/browser/vehicle-recovery-after-v2/store.test.mjs','tests/vehicles/recovery-after-functional.test.mjs')
Run '04-source-types' @("$bins/typescript/bin/tsc",'--noEmit')
Run '05-test-types' @("$bins/typescript/bin/tsc",'-p','tsconfig.tests.json','--noEmit')
Run '06-lint' (@("$bins/eslint/bin/eslint.js",'--max-warnings','0')+@($paths|Where-Object{$_.EndsWith('.ts')}))
$i=0;foreach($path in @($paths|Where-Object{$_.EndsWith('.mjs')})){$i++;Run "07-syntax-$i" @('--check',$path)}
Run '08-architecture' @('scripts/verify-architecture.mjs')
Guard
$rows=@($paths|ForEach-Object{@{path=$_;bytes=(Get-Item -LiteralPath $_).Length;sha256=(Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant()}})
$compact=ConvertTo-Json -InputObject $rows -Depth 5 -Compress
@{status='STATIC_PURE_PASS';completedAt=[DateTime]::UtcNow.ToString('o');files=$rows;fingerprint=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($compact))).ToLowerInvariant();originalFrozenSources=410;originalRawFiles=$raw.Count}|ConvertTo-Json -Depth 8|Set-Content "$evidence/complete.json" -Encoding utf8NoBOM
