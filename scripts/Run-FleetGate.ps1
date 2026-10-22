param(
  [ValidateSet('WEBGPU', 'WEBGL2')][string]$Backend = 'WEBGPU',
  [ValidateSet('smoke', 'dev', 'full')][string]$Profile = 'full',
  [int]$Port = 5196,
  [string]$CaptureId = '',
  [string]$Workloads = '',
  [int]$TimeoutMinutes = 75,
  [switch]$SkipMachineCheck,
  [switch]$KeepOpen
)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)

function Get-CpuLoad {
  $sample = (Get-Counter '\Processor(_Total)\% Processor Time' -SampleInterval 1 -MaxSamples 3).CounterSamples
  ($sample | Measure-Object -Property CookedValue -Average).Average
}

function Get-ForeignBrowsers {
  Get-CimInstance Win32_Process -Filter "Name='chrome.exe' OR Name='msedge.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -notlike '*fleet-gate-220-chrome*' }
}

function Stop-OwnedCapture {
  Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*fleet-gate-220-chrome*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($listener) { Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue }
}

Stop-OwnedCapture
if (-not $SkipMachineCheck) {
  $free = $false
  for ($attempt = 1; $attempt -le 15; $attempt++) {
    $foreign = @(Get-ForeignBrowsers)
    $samples = 1..5 | ForEach-Object { (Get-CimInstance Win32_Processor).LoadPercentage }
    $load = ($samples | Measure-Object -Average).Average
    $peak = ($samples | Measure-Object -Maximum).Maximum
    $builders = @(Get-Process vite, esbuild -ErrorAction SilentlyContinue)
    if ($load -lt 10 -and $peak -lt 25 -and $builders.Count -eq 0) { $free = $true; break }
    Write-Host ("Machine busy (attempt {0}/15): load {1:N1}% (peak {2}%), {3} foreign browser processes, {4} builders. Waiting 120 s." -f $attempt, $load, $peak, $foreign.Count, $builders.Count)
    Start-Sleep -Seconds 120
  }
  if (-not $free) {
    Write-Host 'Machine still busy after 15 waits; refusing to start a timed measurement.' -ForegroundColor Red
    exit 3
  }
}

if (-not $CaptureId) { $CaptureId = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssfffZ') }
$evidence = Join-Path $PWD 'Docs/Evidence/220-fleet-gate/hardware'
$capture = Join-Path $evidence $CaptureId
New-Item -ItemType Directory -Path $capture -Force | Out-Null
$conditions = [ordered]@{
  captureId = $CaptureId
  backend = $Backend
  profile = $Profile
  workloads = if ($Workloads) { $Workloads } else { 'ALL' }
  startedAt = (Get-Date -Format o)
  cpuLoad = (Get-CpuLoad)
  foreignBrowsers = @(Get-ForeignBrowsers).Count
  powerScheme = (powercfg /getactivescheme | Out-String).Trim()
  battery = @(Get-CimInstance Win32_Battery | Select-Object BatteryStatus, EstimatedChargeRemaining)
  machineCheck = if ($SkipMachineCheck) { 'SKIPPED_BY_OPERATOR' } else { 'PASSED_IDLE' }
  focusKeeper = 'AppActivate every 4 s for the whole capture; blur/visibility still fails a run'
}
[IO.File]::WriteAllText((Join-Path $capture 'conditions.json'), ($conditions | ConvertTo-Json -Depth 6))
Write-Host "Capture $CaptureId; conditions recorded."

Start-Process -FilePath 'node' -ArgumentList @(
  '--import', './scripts/register-typescript.mjs', 'scripts/fleet-gate-server.mjs', "$Port"
) -WindowStyle Hidden -RedirectStandardOutput "$env:TEMP\fleet-gate-server.log" -RedirectStandardError "$env:TEMP\fleet-gate-server.err"
Start-Sleep -Seconds 15
if (-not (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)) {
  throw 'Fleet gate server did not start listening'
}

$profileQuery = if ($Profile -eq 'smoke') { '&profile=smoke' } elseif ($Profile -eq 'dev') { '&profile=dev' } else { '' }
$workloadQuery = if ($Workloads) { "&workloads=$Workloads" } else { '' }
$url = "http://127.0.0.1:$Port/?backend=$Backend$profileQuery$workloadQuery&captureId=$CaptureId&autostart=1"
Start-Process -FilePath "$env:ProgramFiles\Google\Chrome\Application\chrome.exe" -ArgumentList @(
  "--user-data-dir=$(Join-Path $env:TEMP 'fleet-gate-220-chrome')", '--no-first-run', '--no-default-browser-check',
  '--start-fullscreen', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling', $url
)
Start-Sleep -Seconds 5
$shell = New-Object -ComObject WScript.Shell
for ($focus = 0; $focus -lt 10; $focus++) {
  $shell.AppActivate('220 physical fleet') | Out-Null
  Start-Sleep -Milliseconds 700
}
Write-Host "Capture URL: $url"

$deadline = (Get-Date).AddMinutes($TimeoutMinutes)
$done = $false
$loadLog = Join-Path $capture 'machine-load.csv'
"timestampIso,loadPercent" | Set-Content -LiteralPath $loadLog -Encoding utf8
while ((Get-Date) -lt $deadline) {
  # Keep the measured window in the foreground: blur is a protocol failure, focus theft is not.
  $shell.AppActivate('220 physical fleet') | Out-Null
  "{0},{1}" -f (Get-Date -Format o), (Get-CimInstance Win32_Processor).LoadPercentage |
    Add-Content -LiteralPath $loadLog -Encoding utf8
  if (Get-ChildItem -LiteralPath $capture -Filter "$($Backend.ToLower())-*matrix*.json" -ErrorAction SilentlyContinue) { $done = $true; break }
  if ($Profile -eq 'smoke' -and (Get-ChildItem -LiteralPath $capture -Filter '*summary-smoke.json' -ErrorAction SilentlyContinue)) {
    $done = $true; break
  }
  Start-Sleep -Seconds 4
}

$files = @(Get-ChildItem -LiteralPath $capture -File | Select-Object Name, Length)
Write-Host ("Capture finished: {0}. Files: {1}" -f $done, $files.Count)
$files | Format-Table -AutoSize
if (-not $KeepOpen) { Stop-OwnedCapture }
if (-not $done) { exit 4 }
