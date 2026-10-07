$ErrorActionPreference='Stop'
if((Get-Location).Path.Replace('\','/') -ne 'F:/Sites/self-driving-academy/.worktrees/vehicle-recovery-01' -or (git branch --show-current) -ne 'loop-pbi/vehicle-recovery-01' -or (git rev-parse HEAD) -ne 'ad32db9c609cce1132669c95312ae202a62b87ed'){throw 'Wrong cwd/branch/HEAD'}
foreach($path in @('.pbi-validation-030/build-after-03','Docs/Evidence/030-vehicle-recovery/browser-after-03','Docs/Evidence/030-vehicle-recovery/browser-build-checks-03')){if(Test-Path -LiteralPath $path){throw "Must be absent $path"}}
$evidence='Docs/Evidence/030-vehicle-recovery/browser-build-checks-03'
New-Item -ItemType Directory -Path $evidence|Out-Null
$original=Get-Content Docs/Evidence/030-vehicle-recovery/browser-after-02/build-manifest.json -Raw|ConvertFrom-Json
$raw=Get-Content Docs/Evidence/030-vehicle-recovery/browser-v3-checks-01/original-raw-before.json -Raw|ConvertFrom-Json
function Guard {
 foreach($row in $original.inputs){foreach($path in @($row.path,($original.archiveRoot+'/'+$row.path))){if((Get-Item -LiteralPath $path).Length -ne $row.bytes -or (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $row.sha256){throw "Original input changed $path"}}}
 foreach($row in $raw){if((Get-Item -LiteralPath $row.path).Length -ne $row.bytes -or (Get-FileHash -LiteralPath $row.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $row.sha256){throw 'Original raw changed'}}
 if((Get-FileHash -LiteralPath $original.nativePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $original.nativeHash){throw 'Native changed'}
}
Guard
function Run([string]$name,[string[]]$arguments){
 $started=[DateTime]::UtcNow.ToString('o'); & node @arguments 1>"$evidence/$name.stdout.txt" 2>"$evidence/$name.stderr.txt"; $code=$LASTEXITCODE
 @{command=@('node')+$arguments;startedAt=$started;completedAt=[DateTime]::UtcNow.ToString('o');exitCode=$code}|ConvertTo-Json -Depth 8|Set-Content "$evidence/$name.json" -Encoding utf8NoBOM
 Write-Output "$name EXIT $code";if($code -ne 0){throw "$name failed; stop/no retry"}
}
Run '01-build' @('--import','./scripts/register-typescript.mjs','tests/browser/vehicle-recovery-after-v3/prepare-browser-build.mjs')
Run '02-current-build-only' @('--import','./scripts/register-typescript.mjs','tests/browser/vehicle-recovery-after-v3/verify-build-only.mjs','Docs/Evidence/030-vehicle-recovery/browser-after-03/build-manifest.json')
Guard
@{status='BUILD_ONLY_PASS';completedAt=[DateTime]::UtcNow.ToString('o');originalCurrentAndArchivedInputs=426;originalRawFiles=$raw.Count;serverStarted=$false;worldCreated=$false;hardwareAcceptance=$false}|ConvertTo-Json|Set-Content "$evidence/complete.json" -Encoding utf8NoBOM
