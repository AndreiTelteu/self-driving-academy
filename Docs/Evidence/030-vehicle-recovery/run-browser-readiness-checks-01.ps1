$ErrorActionPreference = 'Stop'
$root = 'F:/Sites/self-driving-academy/.worktrees/vehicle-recovery-01'
if ((Get-Location).Path.Replace('\','/') -ne $root) { throw 'Wrong cwd' }
if ((git branch --show-current) -ne 'loop-pbi/vehicle-recovery-01') { throw 'Wrong branch' }
$evidence = 'Docs/Evidence/030-vehicle-recovery/browser-readiness-checks-01'
if (Test-Path -LiteralPath $evidence) { throw 'Evidence must be absent' }
New-Item -ItemType Directory -Path $evidence | Out-Null
$plan = Get-Content Docs/Evidence/030-vehicle-recovery/browser-after-readiness-source-01.json -Raw | ConvertFrom-Json
$paths = @($plan.changedFiles.path)
foreach ($path in $paths) {
  $destination = Join-Path "$evidence/source-before" $path
  New-Item -ItemType Directory -Force -Path (Split-Path $destination) | Out-Null
  Copy-Item -LiteralPath $path -Destination $destination
}
$manifest = Get-Content Docs/Evidence/030-vehicle-recovery/after-04/manifest.json -Raw | ConvertFrom-Json
function Guard {
  foreach ($row in $manifest.inputs) {
    $file = Get-Item -LiteralPath $row.path
    if ($file.Length -ne $row.bytes -or (Get-FileHash -LiteralPath $row.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $row.sha256) { throw "AFTER4 current changed: $($row.path)" }
  }
}
Guard
function Run([string]$name, [string[]]$arguments) {
  $started = [DateTime]::UtcNow.ToString('o')
  & node @arguments 1> "$evidence/$name.stdout.txt" 2> "$evidence/$name.stderr.txt"
  $code = $LASTEXITCODE
  @{ command = @('node') + $arguments; startedAt = $started; completedAt = [DateTime]::UtcNow.ToString('o'); exitCode = $code } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath "$evidence/$name.json" -Encoding utf8NoBOM
  Write-Output "$name EXIT $code"
  if ($code -ne 0) { throw "$name failed; retained actual logs" }
}
$bins = 'F:/Sites/self-driving-academy/node_modules'
Run '01-format-write' (@("$bins/prettier/bin/prettier.cjs", '--write') + $paths)
Run '02-format-check' (@("$bins/prettier/bin/prettier.cjs", '--check') + $paths)
Run '03-source-types' @("$bins/typescript/bin/tsc", '--noEmit')
Run '04-test-types' @("$bins/typescript/bin/tsc", '-p', 'tsconfig.tests.json', '--noEmit')
$browserTs = @(rg --files tests/browser/vehicle-recovery-after -g '*.ts')
Run '05-browser-lint' (@("$bins/eslint/bin/eslint.js", '--max-warnings', '0') + $browserTs)
Run '06-architecture' @('scripts/verify-architecture.mjs')
$mjs = @($paths | Where-Object { $_.EndsWith('.mjs') })
$index = 0
foreach ($path in $mjs) { $index++; Run "07-syntax-$index" @('--check', $path) }
Run '08-pure' @('--import', './scripts/register-typescript.mjs', '--test', 'tests/vehicles/recovery-after-browser-boundaries.test.mjs', 'tests/vehicles/recovery-after-browser-observation.test.mjs', 'tests/vehicles/recovery-after-relative.test.mjs', 'tests/vehicles/recovery-after-functional.test.mjs', 'tests/vehicles/recovery-after-native-binding.test.mjs')
Guard
$rows = @($paths | Sort-Object | ForEach-Object { @{path=$_; bytes=(Get-Item -LiteralPath $_).Length; sha256=(Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant()} })
@{ status='STATIC_PURE_PASS'; completedAt=[DateTime]::UtcNow.ToString('o'); after04CurrentInputs=148; files=$rows } | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath "$evidence/complete.json" -Encoding utf8NoBOM
