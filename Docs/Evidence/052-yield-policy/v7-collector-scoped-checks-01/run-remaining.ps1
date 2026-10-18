#requires -Version 5
$ErrorActionPreference = 'Stop'
$cwd = 'C:/Users/aandr/Sites/self-driving-academy/.worktrees/yield-policy-01'
Set-Location -LiteralPath $cwd
$root = 'C:/Users/aandr/Sites/self-driving-academy'
$out = Join-Path $cwd 'Docs/Evidence/052-yield-policy/v7-collector-scoped-checks-01'
$empty = Join-Path $out 'empty.prettierignore'

$files = @(
  'tests/browser/yield-policy-v7/main.ts',
  'tests/browser/yield-policy-v7/runtime.ts',
  'tests/browser/yield-policy-v7/diagnostics.ts',
  'tests/browser/yield-policy-v7/observations.ts',
  'tests/browser/yield-policy-v7/observations.test.ts',
  'tests/browser/yield-policy-v7/protocol.ts',
  'tests/browser/yield-policy-v7/index.html',
  'tests/browser/yield-policy-v7/server.mjs',
  'tests/browser/yield-policy-v7/verify.mjs'
)

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
    name = $Name; executable = $Argv[0]; argv = $Argv[1..($Argv.Length-1)]; cwd = $cwd
    startUtc = $start.ToString('o'); endUtc = $end.ToString('o'); exit = $proc.ExitCode
    timeout = $false; stdout = (Split-Path $stdout -Leaf); stderr = (Split-Path $stderr -Leaf)
  }
  $receipt | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $out "$Name.json")
  $script:manifest += $receipt
  Write-Host "== $Name exit=$($proc.ExitCode)"
  if ($proc.ExitCode -ne 0) { Get-Content $stdout -Tail 40; Get-Content $stderr -Tail 40; throw "failed $Name" }
}

$node = (Get-Command node).Source
$prettier = Join-Path $root 'node_modules/prettier/bin/prettier.cjs'

Invoke-Receipt '06-scoped-prettier-write' (@($node, $prettier, '--write', '--ignore-path', $empty) + $files)
Invoke-Receipt '07-scoped-prettier-recheck' (@($node, $prettier, '--check', '--ignore-path', $empty) + $files)

$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $out 'commands-remaining.json')
Write-Host 'REMAINING CHECKS PASSED'
