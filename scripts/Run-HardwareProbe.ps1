param(
  [ValidateSet('desktop', 'laptop')][string]$Profile = 'laptop',
  [int]$Port = 5189
)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$outputRoot = Join-Path $PWD '.pbi-validation-203'
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
$computer = Get-CimInstance Win32_ComputerSystem
$os = Get-CimInstance Win32_OperatingSystem
$hardware = [ordered]@{
  capturedAt = (Get-Date -Format o)
  profile = $Profile
  manufacturer = $computer.Manufacturer
  model = $computer.Model
  cpu = @(Get-CimInstance Win32_Processor | Select-Object Name, NumberOfCores, NumberOfLogicalProcessors)
  gpu = @(Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion, CurrentHorizontalResolution, CurrentVerticalResolution, CurrentRefreshRate)
  ramBytes = $computer.TotalPhysicalMemory
  os = @{ name = $os.Caption; version = $os.Version; build = $os.BuildNumber }
  powerScheme = (powercfg /getactivescheme | Out-String).Trim()
  battery = @(Get-CimInstance Win32_Battery | Select-Object BatteryStatus, EstimatedChargeRemaining)
}
[IO.File]::WriteAllText((Join-Path $outputRoot 'hardware.json'), ($hardware | ConvertTo-Json -Depth 8))
node scripts/hardware-probe-server.mjs $Profile $Port
exit $LASTEXITCODE
