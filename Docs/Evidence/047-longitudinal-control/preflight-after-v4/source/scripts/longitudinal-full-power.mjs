import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
/** Read-only identification outside native warmup/measurement; never changes power settings. */
export function readLongitudinalPower() {
  if (process.platform !== 'win32')
    return {
      capturedAt: new Date().toISOString(),
      source: 'Unavailable outside Windows',
      powerGuid: null,
      powerScheme: null,
      batteries: null,
      thermals: null,
      energySaver: null,
      acLineStatus: null,
      batterySaverFlag: null,
      systemPowerStatusRead: false,
      preciseAllocatorBytes: null,
    };
  const script = `
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$power047 = (powercfg /getactivescheme | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Cannot read active power scheme' }
$powerGuid047 = [regex]::Match($power047, '[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}').Value.ToLowerInvariant()
if (-not $powerGuid047) { throw 'Cannot identify active power GUID' }
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class LongitudinalPower047 {
 [StructLayout(LayoutKind.Sequential)] public struct PowerStatus {
  public byte ACLineStatus; public byte BatteryFlag; public byte BatteryLifePercent; public byte SystemStatusFlag;
  public uint BatteryLifeTime; public uint BatteryFullLifeTime;
 }
 [DllImport("kernel32.dll", SetLastError=true)]
 [return: MarshalAs(UnmanagedType.Bool)]
 public static extern bool GetSystemPowerStatus(out PowerStatus status);
}
'@
$systemPower047 = [LongitudinalPower047+PowerStatus]::new()
if (-not [LongitudinalPower047]::GetSystemPowerStatus([ref]$systemPower047)) { throw 'GetSystemPowerStatus failed' }
[ordered]@{
 capturedAt = (Get-Date).ToUniversalTime().ToString('o')
 source = 'Read-only powercfg and Win32_Battery CIM'
 powerGuid = $powerGuid047
 powerScheme = $power047
 systemPowerStatusRead = $true
 acLineStatus = [int]$systemPower047.ACLineStatus
 batterySaverFlag = [int]$systemPower047.SystemStatusFlag
 rawSystemPowerStatus = [ordered]@{ batteryFlag = [int]$systemPower047.BatteryFlag; batteryLifePercent = [int]$systemPower047.BatteryLifePercent; batteryLifeTimeSeconds = [long]$systemPower047.BatteryLifeTime; batteryFullLifeTimeSeconds = [long]$systemPower047.BatteryFullLifeTime }
 batteries = @(Get-CimInstance Win32_Battery -ErrorAction Stop | Sort-Object DeviceID | ForEach-Object { [ordered]@{ deviceId = $_.DeviceID; batteryStatus = $_.BatteryStatus; estimatedChargeRemaining = $_.EstimatedChargeRemaining } })
 thermals = $null
 energySaver = $null
 preciseAllocatorBytes = $null
} | ConvertTo-Json -Depth 6 -Compress`;
  return JSON.parse(
    execFileSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8' }),
  );
}
export function assertLongitudinalPowerComparable(start, end) {
  for (const snapshot of [start, end]) {
    assert(Number.isFinite(Date.parse(snapshot.capturedAt)));
    assert(
      /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(snapshot.powerGuid),
      'Active power scheme unavailable',
    );
    assert(Array.isArray(snapshot.batteries), 'Actual battery identification unavailable');
    assert.equal(snapshot.thermals, null);
    assert.equal(snapshot.energySaver, null);
    assert.equal(snapshot.preciseAllocatorBytes, null);
    assert.equal(snapshot.systemPowerStatusRead, true, 'GetSystemPowerStatus unavailable');
    assert([0, 1].includes(snapshot.acLineStatus), 'AC/DC identification unknown');
    assert([0, 1].includes(snapshot.batterySaverFlag), 'Battery saver flag unknown');
  }
  assert.equal(start.powerGuid, end.powerGuid, 'Active power scheme changed');
  const statuses = (snapshot) =>
    snapshot.batteries.map((battery) => {
      assert(typeof battery.deviceId === 'string');
      assert(Number.isInteger(battery.batteryStatus));
      assert(
        battery.estimatedChargeRemaining === null ||
          Number.isFinite(battery.estimatedChargeRemaining),
      );
      return { deviceId: battery.deviceId, batteryStatus: battery.batteryStatus };
    });
  statuses(start);
  statuses(end);
  assert.equal(start.acLineStatus, end.acLineStatus, 'Actual AC/DC source changed');
  assert.equal(start.batterySaverFlag, end.batterySaverFlag, 'Actual battery saver flag changed');
  // CIM charge/status phases remain recorded but can change while actual AC/DC is unchanged.
}
