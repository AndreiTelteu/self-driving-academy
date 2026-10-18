#requires -Version 5
$ErrorActionPreference = 'Stop'
$cwd = 'C:/Users/aandr/Sites/self-driving-academy/.worktrees/yield-policy-01'
Set-Location -LiteralPath $cwd
$root = 'C:/Users/aandr/Sites/self-driving-academy'
$out = Join-Path $cwd 'Docs/Evidence/052-yield-policy/v7-collector-scoped-checks-01'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$empty = Join-Path $out 'empty.prettierignore'
Set-Content -LiteralPath $empty -Value '' -NoNewline

$manifest = @()

function Invoke-Receipt {
  param([string]$Name, [string[]]$Argv)
  $start = [DateTimeOffset]::UtcNow
  $stdout = Join-Path $out "$Name.stdout.txt"
  $stderr = Join-Path $out "$Name.stderr.txt"
  $proc = Start-Process -FilePath $Argv[0] -ArgumentList $Argv[1..($Argv.Length-1)] `
    -WorkingDirectory $cwd -NoNewWindow -PassThru -Wait `
    -RedirectStandardOutput $stdout -RedirectStandardError $stderr
  $end = [DateTimeOffset]::UtcNow
  $receipt = [ordered]@{
    name = $Name
    executable = $Argv[0]
    argv = $Argv[1..($Argv.Length-1)]
    cwd = $cwd
    startUtc = $start.ToString('o')
    endUtc = $end.ToString('o')
    exit = $proc.ExitCode
    timeout = $false
    stdout = (Split-Path $stdout -Leaf)
    stderr = (Split-Path $stderr -Leaf)
  }
  $receipt | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $out "$Name.json")
  $script:manifest += $receipt
  Write-Host "== $Name exit=$($proc.ExitCode) elapsed=$([math]::Round(($end-$start).TotalMilliseconds,1))ms"
  if ($proc.ExitCode -ne 0) {
    Get-Content -LiteralPath $stdout -Tail 40
    Get-Content -LiteralPath $stderr -Tail 40
    throw "Command $Name failed with exit $($proc.ExitCode)"
  }
}

$node = (Get-Command node).Source
$tsc = Join-Path $root 'node_modules/typescript/bin/tsc'
$eslint = Join-Path $root 'node_modules/eslint/bin/eslint.js'
$prettier = Join-Path $root 'node_modules/prettier/bin/prettier.cjs'

Invoke-Receipt '01-pure-tests' @($node, '--import', './scripts/register-typescript.mjs', '--test', '--test-timeout=10000',
  'tests/browser/yield-policy-v7/observations.test.ts',
  'tests/browser/yield-policy-v7/boundary.test.ts',
  'tests/browser/yield-policy-v5/clock-proof.test.ts',
  'tests/browser/yield-policy-v6/diagnostics.test.ts')

Invoke-Receipt '02-targeted-tsc-tests' @($node, $tsc, '--ignoreConfig', '--noEmit', '--strict', '--skipLibCheck',
  '--target', 'ES2022', '--module', 'ESNext', '--moduleResolution', 'bundler', '--lib', 'ES2022', '--types', 'node',
  'tests/browser/yield-policy-v7/observations.test.ts',
  'tests/browser/yield-policy-v7/boundary.test.ts')

Invoke-Receipt '03-targeted-tsc-collector' @($node, $tsc, '--ignoreConfig', '--noEmit', '--strict',
  '--noUnusedLocals', '--noUnusedParameters', '--noFallthroughCasesInSwitch', '--isolatedModules',
  '--allowImportingTsExtensions', '--skipLibCheck', '--target', 'ES2022', '--module', 'ESNext',
  '--moduleResolution', 'bundler', '--lib', 'ES2022,DOM,DOM.Iterable', '--types', 'vite/client',
  'tests/browser/yield-policy-v7/main.ts',
  'tests/browser/yield-policy-v7/runtime.ts',
  'tests/browser/yield-policy-v7/diagnostics.ts',
  'tests/browser/yield-policy-v7/observations.ts',
  'tests/browser/yield-policy-v7/protocol.ts')

Invoke-Receipt '04-scoped-lint' @($node, $eslint,
  'tests/browser/yield-policy-v7/main.ts',
  'tests/browser/yield-policy-v7/runtime.ts',
  'tests/browser/yield-policy-v7/diagnostics.ts',
  'tests/browser/yield-policy-v7/observations.ts',
  'tests/browser/yield-policy-v7/observations.test.ts',
  'tests/browser/yield-policy-v7/protocol.ts',
  'tests/browser/yield-policy-v7/server.mjs',
  'tests/browser/yield-policy-v7/verify.mjs', '--max-warnings', '0')

Invoke-Receipt '05-scoped-prettier-check' @($node, $prettier, '--check', '--ignore-path', $empty,
  'tests/browser/yield-policy-v7/main.ts',
  'tests/browser/yield-policy-v7/runtime.ts',
  'tests/browser/yield-policy-v7/diagnostics.ts',
  'tests/browser/yield-policy-v7/observations.ts',
  'tests/browser/yield-policy-v7/observations.test.ts',
  'tests/browser/yield-policy-v7/protocol.ts',
  'tests/browser/yield-policy-v7/index.html',
  'tests/browser/yield-policy-v7/server.mjs',
  'tests/browser/yield-policy-v7/verify.mjs')

$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $out 'commands.json')
Write-Host 'ALL CHECKS PASSED'
