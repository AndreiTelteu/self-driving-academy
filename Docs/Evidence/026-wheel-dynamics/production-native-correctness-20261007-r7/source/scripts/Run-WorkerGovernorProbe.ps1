param([int]$Port = 5193)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$outputRoot = Join-Path $PWD '.pbi-validation-221'
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
$computer = Get-CimInstance Win32_ComputerSystem
$os = Get-CimInstance Win32_OperatingSystem
$hardware = [ordered]@{
  capturedAt = (Get-Date -Format o)
  cpu = @(Get-CimInstance Win32_Processor | Select-Object Name, NumberOfCores, NumberOfLogicalProcessors)
  gpu = @(Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion, CurrentHorizontalResolution, CurrentVerticalResolution, CurrentRefreshRate)
  ramBytes = $computer.TotalPhysicalMemory
  os = @{ name = $os.Caption; version = $os.Version; build = $os.BuildNumber }
  powerScheme = (powercfg /getactivescheme | Out-String).Trim()
  scope = 'Observed desktop identity; synthetic worker/rAF protocol, no gameplay/GPU gate'
}
[IO.File]::WriteAllText((Join-Path $outputRoot 'hardware.json'), ($hardware | ConvertTo-Json -Depth 8))
node scripts/worker-governor-server.mjs $Port
exit $LASTEXITCODE
