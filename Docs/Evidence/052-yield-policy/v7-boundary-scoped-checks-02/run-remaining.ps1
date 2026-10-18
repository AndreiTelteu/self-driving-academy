$ErrorActionPreference = 'Stop'
$taskRoot = 'F:/Sites/self-driving-academy/.worktrees/yield-policy-01'
if ((Get-Location).Path -ne $taskRoot.Replace('/', '\')) { throw 'Unexpected cwd' }
$evidence = Join-Path $taskRoot 'Docs/Evidence/052-yield-policy/v7-boundary-scoped-checks-02'
$newSources = @('tests/browser/yield-policy-v7/boundary.ts', 'tests/browser/yield-policy-v7/boundary.test.ts')
$handoff = 'Docs/Evidence/052-yield-policy/follow-up052-v7-boundary-source-handoff.md'
$guardPaths = @('tests/browser/yield-policy-v5/clock-proof.ts', 'tests/browser/yield-policy-v5/clock-proof.test.ts', 'tests/browser/yield-policy-v6/diagnostics.test.ts', 'tests/browser/yield-policy-v6/main.ts', 'tests/browser/yield-policy-v6/runtime.ts', 'tests/browser/yield-policy-v6/diagnostics.ts')
foreach ($name in @('main.ts', 'runtime.ts', 'diagnostics.ts')) {
  $guardPaths += "Docs/Evidence/052-yield-policy/browser-v6-20261006T135845838Z/source/tests/browser/yield-policy-v6/$name"
}
$priorDirectory = Join-Path $taskRoot 'Docs/Evidence/052-yield-policy/v7-boundary-scoped-checks-01'
foreach ($file in Get-ChildItem -LiteralPath $priorDirectory -File) {
  $guardPaths += [IO.Path]::GetRelativePath($taskRoot, $file.FullName).Replace('\','/')
}
function Read-Fingerprints($paths) {
  @($paths | ForEach-Object { [ordered]@{ path = $_; sha256 = (Get-FileHash -LiteralPath (Join-Path $taskRoot $_) -Algorithm SHA256).Hash.ToLowerInvariant() } })
}
function Save-Json($name, $value) {
  $value | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $evidence $name) -Encoding utf8
}
$before = Read-Fingerprints ($newSources + @($handoff) + $guardPaths)
Save-Json 'continuation-before.json' $before
$node = (Get-Command node -CommandType Application).Source
$steps = @(
  @{ name = '04-handoff-prettier-write'; argv = @('F:/Sites/self-driving-academy/node_modules/prettier/bin/prettier.cjs', '--ignore-path', 'Docs/Evidence/052-yield-policy/v7-boundary-scoped-checks-02/empty.prettierignore', '--write', $handoff) },
  @{ name = '05-all-scoped-prettier-check'; argv = @('F:/Sites/self-driving-academy/node_modules/prettier/bin/prettier.cjs', '--ignore-path', 'Docs/Evidence/052-yield-policy/v7-boundary-scoped-checks-02/empty.prettierignore', '--check') + $newSources + @($handoff) },
  @{ name = '06-targeted-tsc-ignoreConfig'; argv = @('F:/Sites/self-driving-academy/node_modules/typescript/bin/tsc', '--ignoreConfig', '--noEmit', '--strict', '--skipLibCheck', '--target', 'ES2022', '--module', 'ESNext', '--moduleResolution', 'bundler', '--lib', 'ES2022', '--types', 'node') + $newSources },
  @{ name = '07-scoped-lint'; argv = @('F:/Sites/self-driving-academy/node_modules/eslint/bin/eslint.js') + $newSources + @('--max-warnings', '0') }
)
$results = @(Get-Content -LiteralPath (Join-Path $evidence 'commands.json') -Raw | ConvertFrom-Json)
foreach ($step in $steps) {
  $sourceBefore = Read-Fingerprints ($newSources + @($handoff) + $guardPaths)
  $psi = [Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = $node
  $psi.WorkingDirectory = $taskRoot
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  foreach ($arg in $step.argv) { [void]$psi.ArgumentList.Add($arg) }
  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $psi
  $start = [DateTimeOffset]::UtcNow.ToString('o')
  [void]$process.Start()
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  $timedOut = -not $process.WaitForExit(60000)
  if ($timedOut) { $process.Kill($true); $process.WaitForExit() }
  $end = [DateTimeOffset]::UtcNow.ToString('o')
  $stdout = $stdoutTask.GetAwaiter().GetResult()
  $stderr = $stderrTask.GetAwaiter().GetResult()
  $exitCode = $process.ExitCode
  $process.Dispose()
  [IO.File]::WriteAllText((Join-Path $evidence ($step.name + '.stdout.txt')), $stdout)
  [IO.File]::WriteAllText((Join-Path $evidence ($step.name + '.stderr.txt')), $stderr)
  $sourceAfter = Read-Fingerprints ($newSources + @($handoff) + $guardPaths)
  $record = [ordered]@{ name = $step.name; executable = $node; argv = $step.argv; cwd = $taskRoot; externalTimeoutMs = 60000; startUtc = $start; endUtc = $end; exitCode = $exitCode; timedOut = $timedOut; stdoutFile = $step.name + '.stdout.txt'; stderrFile = $step.name + '.stderr.txt'; sourceBefore = $sourceBefore; sourceAfter = $sourceAfter }
  Save-Json ($step.name + '.json') $record
  $results += $record
  Write-Output "$($step.name) start=$start end=$end exit=$exitCode timeout=$timedOut"
  Write-Output $stdout
  if ($stderr) { Write-Output $stderr }
  if ($timedOut -or $exitCode -ne 0) { break }
}
Save-Json 'after.json' (Read-Fingerprints ($newSources + @($handoff) + $guardPaths))
Save-Json 'commands.json' $results


