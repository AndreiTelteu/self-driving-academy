$ErrorActionPreference = 'Stop'
if ((Get-Location).Path.Replace('\','/') -ne 'F:/Sites/self-driving-academy/.worktrees/vehicle-recovery-01') { throw 'Wrong cwd' }
if ((git branch --show-current) -ne 'loop-pbi/vehicle-recovery-01' -or (git rev-parse HEAD) -ne 'ad32db9c609cce1132669c95312ae202a62b87ed') { throw 'Wrong branch/HEAD' }
foreach ($path in @('.pbi-validation-030/build-after-01','Docs/Evidence/030-vehicle-recovery/browser-after-01','Docs/Evidence/030-vehicle-recovery/browser-build-checks-01')) { if (Test-Path -LiteralPath $path) { throw "Must be absent $path" } }
$evidence = 'Docs/Evidence/030-vehicle-recovery/browser-build-checks-01'
New-Item -ItemType Directory -Path $evidence | Out-Null
$manifest = Get-Content Docs/Evidence/030-vehicle-recovery/after-04/manifest.json -Raw | ConvertFrom-Json
function Guard {
  foreach ($row in $manifest.inputs) {
    foreach ($path in @($row.path, ('Docs/Evidence/030-vehicle-recovery/after-04/source/' + $row.path))) {
      if ((Get-Item -LiteralPath $path).Length -ne $row.bytes -or (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $row.sha256) { throw "AFTER4 changed $path" }
    }
  }
  if ((Get-FileHash -LiteralPath $manifest.native.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.native.sha256) { throw 'Native changed' }
}
Guard
function Run([string]$name, [string[]]$arguments) {
  $started = [DateTime]::UtcNow.ToString('o')
  & node @arguments 1> "$evidence/$name.stdout.txt" 2> "$evidence/$name.stderr.txt"
  $code = $LASTEXITCODE
  @{ command=@('node')+$arguments; startedAt=$started; completedAt=[DateTime]::UtcNow.ToString('o'); exitCode=$code } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath "$evidence/$name.json" -Encoding utf8NoBOM
  Write-Output "$name EXIT $code"
  if ($code -ne 0) { throw "$name failed; immutable logs retained; no retry" }
}
Run '01-build' @('--import','./scripts/register-typescript.mjs','tests/browser/vehicle-recovery-after/prepare-browser-build.mjs')
$verify = 'import {verifyBuild} from "./tests/browser/vehicle-recovery-after/browser-store.mjs"; const b=await verifyBuild("Docs/Evidence/030-vehicle-recovery/browser-after-01/build-manifest.json",false); console.log(JSON.stringify({status:"BUILD_ONLY_PASS",sourceHash:b.sourceHash,artifactHash:b.artifactHash,nativeHash:b.nativeHash,inputs:b.inputs.length,artifacts:b.artifacts.length,zip:b.zip}));'
Run '02-current-build-only' @('--import','./scripts/register-typescript.mjs','--input-type=module','-e',$verify)
Guard
@{status='BUILD_ONLY_PASS'; after04CurrentAndArchivedInputs=148; nativeHash=$manifest.native.sha256; completedAt=[DateTime]::UtcNow.ToString('o'); gameWorldCreated=$false; serverStarted=$false; hardwareAcceptance=$false} | ConvertTo-Json | Set-Content -LiteralPath "$evidence/complete.json" -Encoding utf8NoBOM
