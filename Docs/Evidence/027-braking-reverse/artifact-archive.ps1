param([switch]$Capture)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$evidence = $PSScriptRoot
$workspace = [IO.Path]::GetFullPath((Join-Path $evidence '../../..'))
$build = Join-Path $workspace '.pbi-validation-027/build'
$zipPath = Join-Path $evidence 'build-at-capture.zip'
$manifestPath = if ($Capture) { Join-Path $build 'build-manifest.json' } else { Join-Path $evidence 'build-manifest.json' }
$manifestBytes = [IO.File]::ReadAllBytes($manifestPath)
$manifest = [Text.Encoding]::UTF8.GetString($manifestBytes) | ConvertFrom-Json
function Hash-Bytes([byte[]]$bytes) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
}
if ($Capture) {
    if (Test-Path -LiteralPath $zipPath) { throw 'Immutable artifact ZIP already exists' }
    [IO.Compression.ZipFile]::CreateFromDirectory($build, $zipPath, [IO.Compression.CompressionLevel]::NoCompression, $false)
}
$zip = [IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    $expected = @($manifest.artifacts | ForEach-Object { $_.path }) + @('build-manifest.json', 'hardware.json')
    if ($zip.Entries.Count -ne $expected.Count) { throw 'Unexpected ZIP entry count' }
    $seen = @{}
    foreach ($entry in $zip.Entries) {
        $name = $entry.FullName.Replace('\', '/')
        if ($seen.ContainsKey($name) -or $name -notin $expected) { throw 'Unexpected or duplicate ZIP entry' }
        $seen[$name] = $entry
    }
    $rows = foreach ($artifact in $manifest.artifacts) {
        $entry = $seen[$artifact.path]
        $stream = $entry.Open()
        $memory = New-Object IO.MemoryStream
        try { $stream.CopyTo($memory); $bytes = $memory.ToArray() }
        finally { $stream.Dispose(); $memory.Dispose() }
        $actualHash = Hash-Bytes $bytes
        if ($bytes.Length -ne $artifact.bytes -or $actualHash -ne $artifact.sha256) { throw "Artifact byte mismatch: $($artifact.path)" }
        [ordered]@{ path = $artifact.path; bytes = $bytes.Length; sha256 = $actualHash }
    }
    $entry = $seen['build-manifest.json']
    $stream = $entry.Open()
    $memory = New-Object IO.MemoryStream
    try { $stream.CopyTo($memory); $archivedManifest = $memory.ToArray() }
    finally { $stream.Dispose(); $memory.Dispose() }
    if ((Hash-Bytes $archivedManifest) -ne (Hash-Bytes $manifestBytes)) { throw 'Archived manifest byte mismatch' }
    $stream = $seen['hardware.json'].Open()
    $memory = New-Object IO.MemoryStream
    try { $stream.CopyTo($memory); $hardwareBytes = $memory.ToArray() }
    finally { $stream.Dispose(); $memory.Dispose() }
    if ($Capture -and (Hash-Bytes $hardwareBytes) -ne (Hash-Bytes ([IO.File]::ReadAllBytes((Join-Path $build 'hardware.json'))))) { throw 'Archived hardware byte mismatch' }
}
finally { $zip.Dispose() }
$report = [ordered]@{
    status = 'PASS'; sourceHash = $manifest.sourceHash; artifactHash = $manifest.artifactHash
    zipSha256 = Hash-Bytes ([IO.File]::ReadAllBytes($zipPath))
    zipBytes = ([IO.FileInfo]$zipPath).Length
    manifestSha256 = Hash-Bytes $manifestBytes
    hardwareSha256 = Hash-Bytes $hardwareBytes
    artifactCount = @($rows).Count; artifacts = @($rows)
}
$json = $report | ConvertTo-Json -Depth 8
if ($Capture) { [IO.File]::WriteAllText((Join-Path $evidence 'artifact-archive.json'), $json, (New-Object Text.UTF8Encoding($false))) }
$json
