[CmdletBinding()]
param(
    [string[]]$RequireDone = @(),
    [string]$BoardRoot = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'
$taskBoardRoot = (Resolve-Path -LiteralPath $BoardRoot).Path
$taskColumns = @('To Do', 'In Progress', 'Done')
$taskEntries = @{}
$taskCounts = [ordered]@{}

foreach ($taskColumn in $taskColumns) {
    $taskDirectory = Join-Path $taskBoardRoot $taskColumn
    if (-not (Test-Path -LiteralPath $taskDirectory -PathType Container)) { throw "Coloană lipsă: $taskColumn" }
    $taskFiles = @(Get-ChildItem -LiteralPath $taskDirectory -File -Filter '*.md')
    $taskCounts[$taskColumn] = $taskFiles.Count
    foreach ($taskFile in $taskFiles) {
        $taskText = Get-Content -LiteralPath $taskFile.FullName -Raw -Encoding utf8
        $taskHeaderMatch = [regex]::Match($taskText, '\A---\r?\n([\s\S]*?)\r?\n---')
        if (-not $taskHeaderMatch.Success) { throw "Frontmatter lipsă: $($taskFile.Name)" }
        $taskHeader = $taskHeaderMatch.Groups[1].Value.Replace([string][char]13, '')
        $taskIdMatch = [regex]::Match($taskHeader, '(?m)^id: "(\d{3,})"$')
        $taskStatusMatch = [regex]::Match($taskHeader, '(?m)^status: "(To Do|In Progress|Done)"$')
        $taskDepsMatch = [regex]::Match($taskHeader, '(?m)^depends_on: (\[.*\])$')
        if (-not $taskIdMatch.Success -or -not $taskStatusMatch.Success -or -not $taskDepsMatch.Success) { throw "Metadate invalide: $($taskFile.Name)" }
        $taskId = $taskIdMatch.Groups[1].Value
        if (-not $taskFile.Name.StartsWith($taskId + '-')) { throw "Prefix incompatibil: $($taskFile.Name)" }
        if ($taskStatusMatch.Groups[1].Value -ne $taskColumn) { throw "Status diferit de folder: $($taskFile.Name)" }
        if ($taskEntries.ContainsKey($taskId)) { throw "ID duplicat în board: $taskId" }
        $taskDeps = @($taskDepsMatch.Groups[1].Value | ConvertFrom-Json)
        if (@($taskDeps | Select-Object -Unique).Count -ne $taskDeps.Count) { throw "Dependențe duplicate: $taskId" }
        if ($taskColumn -ne 'To Do') {
            if (-not [regex]::IsMatch($taskHeader, '(?m)^owner: (?!null$).+$')) { throw "Owner lipsă: $taskId" }
            if (-not [regex]::IsMatch($taskHeader, '(?m)^started_at: (?!null$).+$')) { throw "started_at lipsă: $taskId" }
        }
        if ($taskColumn -eq 'Done') {
            if (-not [regex]::IsMatch($taskHeader, '(?m)^completed_at: (?!null$).+$')) { throw "completed_at lipsă: $taskId" }
            if ([regex]::IsMatch($taskText, '(?m)^- \[ \]')) { throw "Checklist neterminat în Done: $taskId" }
            if ($taskText.Contains('De completat.')) { throw "Dovezi incomplete în Done: $taskId" }
        } elseif (-not [regex]::IsMatch($taskHeader, '(?m)^completed_at: null$')) {
            throw "completed_at completat în afara Done: $taskId"
        }
        $taskEntries[$taskId] = [pscustomobject]@{ Id = $taskId; Column = $taskColumn; Dependencies = $taskDeps; Path = $taskFile.FullName }
    }
}

if ($taskEntries.Count -eq 0) { throw 'Board fără PBI-uri' }
$taskSortedIds = @($taskEntries.Keys | Sort-Object { [int]$_ })
for ($taskIndex = 0; $taskIndex -lt $taskSortedIds.Count; $taskIndex++) {
    if ([int]$taskSortedIds[$taskIndex] -ne ($taskIndex + 1)) { throw "Numerotare necontinuă la $($taskSortedIds[$taskIndex])" }
}
foreach ($taskEntry in $taskEntries.Values) {
    foreach ($taskDep in $taskEntry.Dependencies) {
        if (-not $taskEntries.ContainsKey([string]$taskDep)) { throw "Dependență inexistentă $taskDep pentru $($taskEntry.Id)" }
        if ($taskEntry.Column -ne 'To Do' -and $taskEntries[[string]$taskDep].Column -ne 'Done') { throw "Dependență nefinalizată $taskDep pentru $($taskEntry.Id)" }
    }
}
$taskVisits = @{}
function Visit-Pbi([string]$TaskId) {
    if ($taskVisits[$TaskId] -eq 1) { throw "Ciclu de dependențe la $TaskId" }
    if ($taskVisits[$TaskId] -eq 2) { return }
    $taskVisits[$TaskId] = 1
    foreach ($taskDependency in $taskEntries[$TaskId].Dependencies) { Visit-Pbi ([string]$taskDependency) }
    $taskVisits[$TaskId] = 2
}
foreach ($taskId in $taskSortedIds) { Visit-Pbi $taskId }
$taskVerifiedDone = @()
foreach ($taskRequiredId in $RequireDone) {
    if (-not $taskEntries.ContainsKey($taskRequiredId)) { throw "PBI cerut inexistent: $taskRequiredId" }
    if ($taskEntries[$taskRequiredId].Column -ne 'Done') { throw "PBI $taskRequiredId nu este în Done. Mutarea fizică este obligatorie." }
    $taskVerifiedDone += $taskEntries[$taskRequiredId].Path
}
[ordered]@{
    Valid = $true
    Total = $taskEntries.Count
    Columns = $taskCounts
    FirstId = $taskSortedIds[0]
    LastId = $taskSortedIds[-1]
    RequiredDonePaths = $taskVerifiedDone
} | ConvertTo-Json -Depth 5
