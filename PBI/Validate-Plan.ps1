[CmdletBinding()]
param(
    [string]$ProjectRoot = ''
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($ProjectRoot)) { $ProjectRoot = Split-Path -Parent $PSScriptRoot }
if ([string]::IsNullOrWhiteSpace($ProjectRoot)) { $ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path) }
$planRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$planBoardRoot = Join-Path $planRoot 'PBI'
$planBoardResult = & (Join-Path $PSScriptRoot 'Validate-Board.ps1') -BoardRoot $planBoardRoot | ConvertFrom-Json
if (-not $planBoardResult.Valid) { throw 'Board invalid' }

$planBoardConfigPath = Join-Path $planBoardRoot 'BOARD.json'
if (-not (Test-Path -LiteralPath $planBoardConfigPath -PathType Leaf)) { throw 'PBI/BOARD.json lipsește' }
$planBoardConfig = Get-Content -LiteralPath $planBoardConfigPath -Raw -Encoding utf8 | ConvertFrom-Json
$planFirstId = [int]$planBoardConfig.firstId
$planRetiredThrough = [int]$planBoardConfig.retiredThrough
if ($planFirstId -ne 259) { throw "Boardul curent trebuie să începă la 259, nu $planFirstId" }
if ($planRetiredThrough -ne 258) { throw "retiredThrough trebuie să fie 258, nu $planRetiredThrough" }

function Read-PlanText([string]$RelativePath) {
    Get-Content -LiteralPath (Join-Path $planRoot $RelativePath) -Raw -Encoding utf8
}

function Read-HeaderJson([string]$Header, [string]$Field) {
    $planFieldMatch = [regex]::Match($Header, '(?m)^' + [regex]::Escape($Field) + ': (.+)$')
    if (-not $planFieldMatch.Success) { throw "Câmp lipsă: $Field" }
    $planFieldMatch.Groups[1].Value | ConvertFrom-Json
}

$planTasks = @{}
foreach ($planColumn in @('To Do', 'In Progress', 'Done')) {
    foreach ($planFile in Get-ChildItem -LiteralPath (Join-Path $planBoardRoot $planColumn) -File -Filter '*.md') {
        $planText = Get-Content -LiteralPath $planFile.FullName -Raw -Encoding utf8
        $planHeader = [regex]::Match($planText, '\A---\r?\n([\s\S]*?)\r?\n---').Groups[1].Value.Replace([string][char]13, '')
        $planId = Read-HeaderJson $planHeader 'id'
        $planDependencies = @()
        foreach ($planDependencyId in (Read-HeaderJson $planHeader 'depends_on')) { $planDependencies += [string]$planDependencyId }
        $planPerformanceChecks = @()
        $planPerformanceMatch = [regex]::Match($planHeader, '(?m)^performance_checks: (.+)$')
        if ($planPerformanceMatch.Success) {
            foreach ($planPerformanceCheck in ($planPerformanceMatch.Groups[1].Value | ConvertFrom-Json)) {
                $planPerformanceChecks += [string]$planPerformanceCheck
                if ($planPerformanceCheck -cnotin @('frame','simulation','memory','workers','storage','loading','ui','assets','soak')) {
                    throw "Performance check necunoscut: $planPerformanceCheck în $planId"
                }
            }
        }
        if ([int]$planId -lt $planFirstId) { throw "Task cu ID retras: $planId" }
        foreach ($planDependencyId in $planDependencies) {
            if ([int]$planDependencyId -lt $planFirstId) { throw "Dependență de ID retras $planDependencyId în $planId" }
        }
        $planTasks[$planId] = [pscustomobject]@{
            Id = $planId
            Title = Read-HeaderJson $planHeader 'title'
            Module = Read-HeaderJson $planHeader 'module'
            Release = Read-HeaderJson $planHeader 'release'
            Dependencies = $planDependencies
            PerformanceChecks = $planPerformanceChecks
        }
    }
}

$planIndexText = Read-PlanText 'PBI/README.md'
$planIndexRows = [regex]::Matches($planIndexText, '(?m)^\| (\d{3,}) \| ([^|]+) \| ([^|]+) \| (V[1234]) \| ([^|]+) \|\r?$')
$planIndexIds = @{}
foreach ($planRow in $planIndexRows) {
    $planId = $planRow.Groups[1].Value
    if ($planIndexIds.ContainsKey($planId) -or -not $planTasks.ContainsKey($planId)) { throw "ID index duplicat/inexistent: $planId" }
    $planIndexIds[$planId] = $true
    $planTask = $planTasks[$planId]
    $planIndexDepsText = $planRow.Groups[5].Value.Trim()
    $planIndexDeps = @()
    if ($planIndexDepsText -match '\d') { $planIndexDeps = @($planIndexDepsText -split ',' | ForEach-Object { $_.Trim() }) }
    if ($planTask.Title -cne $planRow.Groups[2].Value.Trim() -or $planTask.Module -cne $planRow.Groups[3].Value.Trim() -or $planTask.Release -cne $planRow.Groups[4].Value -or (@($planTask.Dependencies) -join ',') -cne ($planIndexDeps -join ',')) {
        throw "Indexul diferă de PBI $planId"
    }
}
if ($planIndexIds.Count -ne $planTasks.Count) { throw 'Indexul nu acoperă toate PBI-urile' }

$planMatrixText = Read-PlanText 'Docs/21-acoperire-functionalitati.md'
$planMatrixRows = [regex]::Matches($planMatrixText, '(?m)^\| ([^|]+) \| ([^|]+) \| (\d{3}) \| ([^|]+) \|\r?$')
$planMatrixIds = @{}
foreach ($planRow in $planMatrixRows) {
    $planId = $planRow.Groups[3].Value
    if ($planMatrixIds.ContainsKey($planId) -or -not $planTasks.ContainsKey($planId)) { throw "ID matrice duplicat/inexistent: $planId" }
    $planMatrixIds[$planId] = $true
}
if ($planMatrixIds.Count -ne $planTasks.Count) { throw 'Matricea Docs/21 nu acoperă toate PBI-urile' }

$planGapText = Read-PlanText 'Docs/31-stare-implementare-si-lacune.md'
$planGapRows = [regex]::Matches($planGapText, '(?m)^\| (\d{3}) \| ([^|]+) \| (V[1234]) \| ([^|]+) \|\r?$')
$planGapIds = @{}
foreach ($planRow in $planGapRows) {
    $planId = $planRow.Groups[1].Value
    if ($planGapIds.ContainsKey($planId) -or -not $planTasks.ContainsKey($planId)) { throw "ID Docs/31 duplicat/inexistent: $planId" }
    $planGapIds[$planId] = $true
}
if ($planGapIds.Count -ne $planTasks.Count) { throw 'Docs/31 nu acoperă toate PBI-urile' }

$planCatalog = Read-PlanText 'Docs/driving-parameters.json' | ConvertFrom-Json
$planParameters = @{}
$planInitialCount = 0
foreach ($planParameter in $planCatalog.parameters) {
    if ($planParameters.ContainsKey($planParameter.key)) { throw "Cheie catalog duplicată: $($planParameter.key)" }
    foreach ($planNumber in @($planParameter.default, $planParameter.min, $planParameter.max)) {
        if ([double]::IsNaN($planNumber) -or [double]::IsInfinity($planNumber)) { throw "Număr invalid: $($planParameter.key)" }
    }
    if ($planParameter.min -ge $planParameter.max -or $planParameter.default -lt $planParameter.min -or $planParameter.default -gt $planParameter.max) { throw "Interval invalid: $($planParameter.key)" }
    if ($planParameter.implementationStage -notin @('initial_learning_target', 'extension')) { throw "Etapă parametru necunoscută: $($planParameter.key)" }
    if ($planParameter.implementationStage -eq 'initial_learning_target') { $planInitialCount++ }
    $planParameters[$planParameter.key] = $planParameter
}
if ($planParameters.Count -ne 80 -or $planInitialCount -ne 24) { throw 'Catalogul trebuie să conțină 80 de chei, cu 24 ținte inițiale' }

$planCatalogRows = [regex]::Matches((Read-PlanText 'Docs/11-catalog-parametri.md'), '(?m)^\| ([a-z][a-z0-9_]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([MR]) \|\r?$')
$planCatalogKeys = @{}
foreach ($planRow in $planCatalogRows) {
    $planKey = $planRow.Groups[1].Value
    if ($planCatalogKeys.ContainsKey($planKey) -or -not $planParameters.ContainsKey($planKey)) { throw "Cheie Markdown duplicată/inexistentă: $planKey" }
    $planCatalogKeys[$planKey] = $true
    $planParameter = $planParameters[$planKey]
    $planRange = $planRow.Groups[3].Value.Trim() -split '[\u2013\u2014]'
    $planDefault = [double]::Parse($planRow.Groups[2].Value.Trim(), [Globalization.CultureInfo]::InvariantCulture)
    $planMinimum = [double]::Parse($planRange[0].Trim(), [Globalization.CultureInfo]::InvariantCulture)
    $planMaximum = [double]::Parse($planRange[1].Trim(), [Globalization.CultureInfo]::InvariantCulture)
    $planInitial = $planRow.Groups[6].Value -eq 'M'
    if ($planDefault -ne $planParameter.default -or $planMinimum -ne $planParameter.min -or $planMaximum -ne $planParameter.max -or $planRow.Groups[4].Value.Trim() -cne $planParameter.unit -or $planRow.Groups[5].Value.Trim() -cne $planParameter.description -or $planInitial -ne ($planParameter.implementationStage -eq 'initial_learning_target')) { throw "Catalogul Markdown diferă de JSON: $planKey" }
}
if ($planCatalogKeys.Count -ne $planParameters.Count) { throw 'Catalogul Markdown este incomplet' }

$planStageCounts = [ordered]@{}
foreach ($planStage in @('V1','V2','V3','V4')) { $planStageCounts[$planStage] = @($planTasks.Values | Where-Object { $_.Release -eq $planStage }).Count }
foreach ($planStage in @('V1','V2','V3','V4')) {
    $planStageRow = [regex]::Match($planIndexText, '(?m)^\| ' + $planStage + ' \| [^|]+ \| (\d+) \|')
    if (-not $planStageRow.Success -or [int]$planStageRow.Groups[1].Value -ne $planStageCounts[$planStage]) { throw "Count etapă incompatibil: $planStage" }
}

$planModuleCount = @(Get-ChildItem -LiteralPath (Join-Path $planRoot 'Docs') -File -Filter '*.md' | Where-Object { $_.Name -match '^\d{2}-' }).Count
$planRootReadme = Read-PlanText 'README.md'
$planDocsReadme = Read-PlanText 'Docs/README.md'
if ($planRootReadme -notmatch ("$planModuleCount de documente") -or $planRootReadme -notmatch ("$($planTasks.Count) task-uri")) { throw 'Counts README rădăcină diferite de plan' }
if ($planDocsReadme -notmatch ("$($planTasks.Count) de taskuri")) { throw 'Counts Docs/README diferite de plan' }

$planMarkdownFiles = @(Get-Item -LiteralPath (Join-Path $planRoot 'README.md'), (Join-Path $planRoot 'AGENTS.md')) + @(Get-ChildItem -LiteralPath (Join-Path $planRoot 'Docs'), $planBoardRoot -Recurse -File -Filter '*.md' | Where-Object { $_.FullName -notmatch '[\\/]Docs[\\/](Evidence|Archive)[\\/]' })
$planCheckedLinks = 0
foreach ($planFile in $planMarkdownFiles) {
    $planText = Get-Content -LiteralPath $planFile.FullName -Raw -Encoding utf8
    foreach ($planLink in [regex]::Matches($planText, '\]\(([^)]+)\)')) {
        $planTarget = $planLink.Groups[1].Value.Trim('<', '>')
        if ($planTarget -match '^(https?:|#|app:|codex:)') { continue }
        $planTarget = ($planTarget -split '#')[0]
        if (-not (Test-Path -LiteralPath (Join-Path $planFile.DirectoryName $planTarget))) { throw "Link local rupt în $($planFile.FullName): $planTarget" }
        $planCheckedLinks++
    }
}

[ordered]@{
    Valid = $true
    TotalTasks = $planTasks.Count
    FirstId = $planFirstId
    RetiredThrough = $planRetiredThrough
    StageCounts = $planStageCounts
    ModuleCount = $planModuleCount
    ParameterCount = $planParameters.Count
    InitialParameterCount = $planInitialCount
    CheckedLocalLinks = $planCheckedLinks
    MatrixRows = $planMatrixIds.Count
    GapRows = $planGapIds.Count
} | ConvertTo-Json -Depth 5
