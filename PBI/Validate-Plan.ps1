[CmdletBinding()]
param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$planRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$planBoardRoot = Join-Path $planRoot 'PBI'
$planBoardResult = & (Join-Path $PSScriptRoot 'Validate-Board.ps1') -BoardRoot $planBoardRoot | ConvertFrom-Json
if (-not $planBoardResult.Valid) { throw 'Board invalid' }

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
        $planRoleMatch = [regex]::Match($planHeader, '(?m)^parameter_role: (.+)$')
        $planKeysMatch = [regex]::Match($planHeader, '(?m)^parameter_keys: (.+)$')
        $planPerformanceMatch = [regex]::Match($planHeader, '(?m)^performance_checks: (.+)$')
        $planPerformanceChecks = @()
        if ($planPerformanceMatch.Success) {
            $planPerformanceChecks = @($planPerformanceMatch.Groups[1].Value | ConvertFrom-Json)
            if ($planPerformanceChecks.Count -eq 0 -or @($planPerformanceChecks | Select-Object -Unique).Count -ne $planPerformanceChecks.Count) { throw "Performance checks goale/duplicate: $planId" }
            foreach ($planPerformanceCheck in $planPerformanceChecks) {
                if ($planPerformanceCheck -cnotin @('frame','simulation','memory','workers','storage','loading','ui','assets','soak')) { throw "Performance check necunoscut: $planPerformanceCheck în $planId" }
            }
        }
        $planRole = $null
        $planKeys = @()
        if ($planRoleMatch.Success -ne $planKeysMatch.Success) { throw "Metadate per parametru incomplete: $planId" }
        if ($planRoleMatch.Success) {
            $planRole = $planRoleMatch.Groups[1].Value | ConvertFrom-Json
            $planKeys = @($planKeysMatch.Groups[1].Value | ConvertFrom-Json)
            if ($planRole -notin @('policy', 'estimator')) { throw "Rol necunoscut: $planId" }
            if ($planKeys.Count -eq 0 -or @($planKeys | Select-Object -Unique).Count -ne $planKeys.Count) { throw "Chei goale/duplicate: $planId" }
        }
        $planTasks[$planId] = [pscustomobject]@{
            Id = $planId
            Title = Read-HeaderJson $planHeader 'title'
            Module = Read-HeaderJson $planHeader 'module'
            Release = Read-HeaderJson $planHeader 'release'
            Dependencies = @(Read-HeaderJson $planHeader 'depends_on')
            Role = $planRole
            Keys = $planKeys
            PerformanceChecks = $planPerformanceChecks
        }
    }
}

$planAncestorCache = @{}
function Get-PlanAncestors([string]$TaskId) {
    if ($planAncestorCache.ContainsKey($TaskId)) { return ,$planAncestorCache[$TaskId] }
    $planAncestors = @{}
    foreach ($planDependency in $planTasks[$TaskId].Dependencies) {
        $planAncestors[$planDependency] = $true
        $planNested = Get-PlanAncestors $planDependency
        foreach ($planNestedId in $planNested.Keys) { $planAncestors[$planNestedId] = $true }
    }
    $planAncestorCache[$TaskId] = $planAncestors
    return ,$planAncestors
}

$planIndexText = Read-PlanText 'PBI/README.md'
$planIndexRows = [regex]::Matches($planIndexText, '(?m)^\| (\d{3,}) \| ([^|]+) \| ([^|]+) \| (V[123]) \| ([^|]+) \|\r?$')
$planIndexIds = @{}
foreach ($planRow in $planIndexRows) {
    $planId = $planRow.Groups[1].Value
    if ($planIndexIds.ContainsKey($planId) -or -not $planTasks.ContainsKey($planId)) { throw "ID index duplicat/inexistent: $planId" }
    $planIndexIds[$planId] = $true
    $planTask = $planTasks[$planId]
    $planIndexDepsText = $planRow.Groups[5].Value.Trim()
    $planIndexDeps = @()
    if ($planIndexDepsText -ne '—') { $planIndexDeps = @($planIndexDepsText -split ',' | ForEach-Object { $_.Trim() }) }
    if ($planTask.Title -cne $planRow.Groups[2].Value.Trim() -or $planTask.Module -cne $planRow.Groups[3].Value.Trim() -or $planTask.Release -cne $planRow.Groups[4].Value -or (@($planTask.Dependencies) -join ',') -cne ($planIndexDeps -join ',')) {
        throw "Indexul diferă de PBI $planId"
    }
}
if ($planIndexIds.Count -ne $planTasks.Count) { throw 'Indexul nu acoperă toate PBI-urile' }

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
    $planRange = $planRow.Groups[3].Value.Trim() -split '–'
    $planDefault = [double]::Parse($planRow.Groups[2].Value.Trim(), [Globalization.CultureInfo]::InvariantCulture)
    $planMinimum = [double]::Parse($planRange[0], [Globalization.CultureInfo]::InvariantCulture)
    $planMaximum = [double]::Parse($planRange[1], [Globalization.CultureInfo]::InvariantCulture)
    $planInitial = $planRow.Groups[6].Value -eq 'M'
    if ($planDefault -ne $planParameter.default -or $planMinimum -ne $planParameter.min -or $planMaximum -ne $planParameter.max -or $planRow.Groups[4].Value.Trim() -cne $planParameter.unit -or $planRow.Groups[5].Value.Trim() -cne $planParameter.description -or $planInitial -ne ($planParameter.implementationStage -eq 'initial_learning_target')) { throw "Catalogul Markdown diferă de JSON: $planKey" }
}
if ($planCatalogKeys.Count -ne $planParameters.Count) { throw 'Catalogul Markdown este incomplet' }

$planMatrixRows = [regex]::Matches((Read-PlanText 'Docs/21-acoperire-functionalitati.md'), '(?m)^\| ([a-z][a-z0-9_]+) \| (V[12]) \| (\d+) \| (\d+) \| (\d+) \|\r?$')
$planMatrixKeys = @{}
foreach ($planRow in $planMatrixRows) {
    $planKey = $planRow.Groups[1].Value
    if ($planMatrixKeys.ContainsKey($planKey) -or -not $planParameters.ContainsKey($planKey)) { throw "Cheie matrice duplicată/inexistentă: $planKey" }
    $planMatrixKeys[$planKey] = $true
    $planExpectedRelease = 'V2'
    $planExpectedGate = '187'
    if ($planParameters[$planKey].implementationStage -eq 'initial_learning_target') { $planExpectedRelease = 'V1'; $planExpectedGate = '108' }
    if ($planRow.Groups[2].Value -ne $planExpectedRelease -or $planRow.Groups[5].Value -ne $planExpectedGate) { throw "Etapă/gate incompatibil: $planKey" }
    $planGateAncestors = Get-PlanAncestors $planExpectedGate
    foreach ($planRoleColumn in @(@('policy', 3), @('estimator', 4))) {
        $planRole = $planRoleColumn[0]
        $planTaskId = $planRow.Groups[[int]$planRoleColumn[1]].Value
        if (-not $planTasks.ContainsKey($planTaskId)) { throw "Task matrice inexistent: $planTaskId" }
        $planTask = $planTasks[$planTaskId]
        if ($planTask.Role -ne $planRole -or $planKey -cnotin $planTask.Keys -or $planTask.Release -ne $planExpectedRelease) { throw "Matrice/parameter_keys incompatibile: $planKey în $planTaskId ($planRole)" }
        if (-not $planGateAncestors.ContainsKey($planTaskId)) { throw "Gate $planExpectedGate nu include $planTaskId pentru $planKey" }
    }
}
if ($planMatrixKeys.Count -ne $planParameters.Count) { throw 'Matricea nu acoperă catalogul complet' }
foreach ($planTask in $planTasks.Values) {
    foreach ($planKey in $planTask.Keys) {
        if (-not $planParameters.ContainsKey($planKey)) { throw "Cheie PBI necunoscută: $planKey" }
        $planOwnedRows = @($planMatrixRows | Where-Object { $_.Groups[1].Value -ceq $planKey -and (($_.Groups[3].Value -eq $planTask.Id -and $planTask.Role -eq 'policy') -or ($_.Groups[4].Value -eq $planTask.Id -and $planTask.Role -eq 'estimator')) })
        if ($planOwnedRows.Count -ne 1) { throw "Cheie PBI fără corespondență unică în matrice: $planKey/$($planTask.Id)" }
    }
}

foreach ($planGatePair in @(@('162', 1), @('190', 2), @('202', 3))) {
    $planGateId = $planGatePair[0]
    $planGateStage = [int]$planGatePair[1]
    $planGateAncestors = Get-PlanAncestors $planGateId
    foreach ($planTask in $planTasks.Values) {
        if ([int]$planTask.Release.Substring(1) -le $planGateStage -and $planTask.Id -ne $planGateId -and -not $planGateAncestors.ContainsKey($planTask.Id)) { throw "Gate $planGateId nu include PBI $($planTask.Id)" }
    }
}

$planEarlyAncestors = Get-PlanAncestors '204'
foreach ($planLateId in @('042','057','065','108','115','162')) {
    if ($planEarlyAncestors.ContainsKey($planLateId)) { throw "Prototipul timpuriu depinde de milestone târziu: $planLateId" }
}
if (-not (Get-PlanAncestors '042').ContainsKey('204') -or -not (Get-PlanAncestors '021').ContainsKey('203')) { throw 'Milestone-urile timpurii nu condiționează extinderea' }
if ((Get-PlanAncestors '112').ContainsKey('108')) { throw 'Integrarea este încă blocată de gate-ul final de 24' }

$planRequiredPerformance = [ordered]@{
    '008' = @('simulation','frame')
    '019' = @('frame','memory')
    '021' = @('simulation')
    '034' = @('simulation')
    '103' = @('workers')
    '131' = @('storage','frame')
    '139' = @('simulation')
    '144' = @('workers')
    '145' = @('assets')
    '146' = @('assets')
    '150' = @('assets','loading')
    '159' = @('soak','memory')
    '160' = @('frame')
    '203' = @('frame','memory','loading')
    '204' = @('frame','workers')
    '206' = @('storage','frame')
    '207' = @('memory','storage')
    '210' = @('ui','frame')
    '214' = @('ui','frame')
    '218' = @('frame','simulation','memory')
    '219' = @('simulation','frame')
    '220' = @('frame','simulation','workers','memory')
    '221' = @('workers','memory','frame')
    '222' = @('storage','memory','frame')
    '223' = @('assets','loading','frame','memory')
    '224' = @('frame','memory','workers','storage','assets','soak')
    '227' = @('simulation','assets','memory','frame')
    '234' = @('storage','memory','workers','ui')
    '235' = @('frame','simulation','memory','workers','storage','assets','soak')
}
foreach ($planPerformanceId in $planRequiredPerformance.Keys) {
    if (-not $planTasks.ContainsKey($planPerformanceId)) { throw "PBI de performanță lipsă: $planPerformanceId" }
    foreach ($planPerformanceCheck in $planRequiredPerformance[$planPerformanceId]) {
        if ($planPerformanceCheck -cnotin $planTasks[$planPerformanceId].PerformanceChecks) { throw "PBI $planPerformanceId fără performance_checks obligatoriu: $planPerformanceCheck" }
    }
}
$planPerformancePrerequisites = [ordered]@{
    '021' = @('218')
    '204' = @('218','219','221')
    '116' = @('220')
    '145' = @('220','223')
    '146' = @('220','223')
    '103' = @('221')
    '144' = @('221')
    '131' = @('222')
    '234' = @('221','222')
    '160' = @('224')
}
foreach ($planPerformanceId in $planPerformancePrerequisites.Keys) {
    $planPerformanceAncestors = Get-PlanAncestors $planPerformanceId
    foreach ($planPrerequisiteId in $planPerformancePrerequisites[$planPerformanceId]) {
        if (-not $planPerformanceAncestors.ContainsKey($planPrerequisiteId)) { throw "PBI $planPerformanceId nu include gate-ul de performanță $planPrerequisiteId" }
    }
}
foreach ($planLateId in @('116','145','146','150','162')) {
    if ((Get-PlanAncestors '220').ContainsKey($planLateId)) { throw "Gate-ul timpuriu de flotă depinde de scope ulterior: $planLateId" }
}

$planMarkdownFiles = @(Get-Item -LiteralPath (Join-Path $planRoot 'README.md'), (Join-Path $planRoot 'AGENTS.md')) + @(Get-ChildItem -LiteralPath (Join-Path $planRoot 'Docs'), $planBoardRoot -Recurse -File -Filter '*.md')
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

$planStageCounts = [ordered]@{}
foreach ($planStage in @('V1','V2','V3')) { $planStageCounts[$planStage] = @($planTasks.Values | Where-Object { $_.Release -eq $planStage }).Count }
$planModuleCount = @(Get-ChildItem -LiteralPath (Join-Path $planRoot 'Docs') -File -Filter '*.md' | Where-Object { $_.Name -match '^\d{2}-' }).Count
$planRootReadme = Read-PlanText 'README.md'
$planDocsReadme = Read-PlanText 'Docs/README.md'
if ($planRootReadme -notmatch ("$planModuleCount de documente") -or $planRootReadme -notmatch ("$($planTasks.Count) task-uri") -or $planDocsReadme -notmatch ("conține $($planTasks.Count) task-uri")) { throw 'Counts README diferite de plan' }
foreach ($planStage in @('V1','V2','V3')) {
    $planStageRow = [regex]::Match($planIndexText, '(?m)^\| ' + $planStage + ' \| [^|]+ \| (\d+) \|')
    if (-not $planStageRow.Success -or [int]$planStageRow.Groups[1].Value -ne $planStageCounts[$planStage]) { throw "Count etapă incompatibil: $planStage" }
}

[ordered]@{
    Valid = $true
    TotalTasks = $planTasks.Count
    StageCounts = $planStageCounts
    ModuleCount = $planModuleCount
    ParameterCount = $planParameters.Count
    InitialParameterCount = $planInitialCount
    CheckedLocalLinks = $planCheckedLinks
    EarlyPrototypePrerequisites = $planEarlyAncestors.Count
    PerformanceTaskCount = @($planTasks.Values | Where-Object { $_.PerformanceChecks.Count -gt 0 }).Count
    PerformanceDependencyChecks = $planPerformancePrerequisites.Count
} | ConvertTo-Json -Depth 5
