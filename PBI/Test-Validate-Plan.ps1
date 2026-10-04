[CmdletBinding()]
param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$planTestSource = (Resolve-Path -LiteralPath $ProjectRoot).Path
$planTestValidator = Join-Path $PSScriptRoot 'Validate-Plan.ps1'
$planTestTempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$planTestName = 'self-driving-academy-plan-tests-' + [guid]::NewGuid().ToString('N')
$planTestFixture = [IO.Path]::GetFullPath((Join-Path $planTestTempRoot $planTestName))
$planTestBoundary = $planTestTempRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$planTestPassed = [Collections.Generic.List[string]]::new()
$planTestEncoding = [Text.UTF8Encoding]::new($false)

if (-not $planTestFixture.StartsWith($planTestBoundary, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Fixture în afara directorului temporar'
}

function Test-PlanRejectsMutation {
    param(
        [string]$Name,
        [string]$RelativePath,
        [string]$Original,
        [string]$Replacement,
        [string]$ExpectedError
    )
    $planTestFile = Join-Path $planTestFixture $RelativePath
    $planTestBefore = [IO.File]::ReadAllText($planTestFile)
    if (-not $planTestBefore.Contains($Original)) { throw "Fixture nepotrivit: $Name" }
    try {
        [IO.File]::WriteAllText($planTestFile, $planTestBefore.Replace($Original, $Replacement), $planTestEncoding)
        $planTestError = $null
        try { $null = & $planTestValidator -ProjectRoot $planTestFixture }
        catch { $planTestError = $_.Exception.Message }
        if (-not $planTestError) { throw "Regresie acceptată: $Name" }
        if ($planTestError -notmatch $ExpectedError) { throw "Eroare neașteptată pentru $Name : $planTestError" }
        $planTestPassed.Add($Name)
    }
    finally { [IO.File]::WriteAllText($planTestFile, $planTestBefore, $planTestEncoding) }
}

try {
    $null = New-Item -ItemType Directory -Path $planTestFixture
    foreach ($planTestFileName in @('README.md', 'AGENTS.md')) {
        Copy-Item -LiteralPath (Join-Path $planTestSource $planTestFileName) -Destination $planTestFixture
    }
    foreach ($planTestDirectory in @('Docs', 'PBI')) {
        Copy-Item -LiteralPath (Join-Path $planTestSource $planTestDirectory) -Destination $planTestFixture -Recurse
    }
    $planTestBaseline = & $planTestValidator -ProjectRoot $planTestFixture | ConvertFrom-Json
    if (-not $planTestBaseline.Valid) { throw 'Fixture inițial invalid' }
    $planTestPassed.Add('Planul nemodificat este valid')

    Test-PlanRejectsMutation -Name 'yield_time_gap respinge politica STOP' `
        -RelativePath 'Docs/21-acoperire-functionalitati.md' `
        -Original '| yield_time_gap | V1 | 052 | 098 | 108 |' `
        -Replacement '| yield_time_gap | V1 | 051 | 098 | 108 |' `
        -ExpectedError 'Matrice/parameter_keys incompatibile: yield_time_gap'

    Test-PlanRejectsMutation -Name 'Indexul respinge dependențe diferite de PBI' `
        -RelativePath 'PBI/README.md' `
        -Original '| 042 | Construirea cartierului în Babylon | Oraș | V1 | 015, 016, 032, 040, 204 |' `
        -Replacement '| 042 | Construirea cartierului în Babylon | Oraș | V1 | 015, 016, 032, 040 |' `
        -ExpectedError 'Indexul diferă de PBI 042'

    Test-PlanRejectsMutation -Name 'Catalogul respinge divergența Markdown/JSON' `
        -RelativePath 'Docs/11-catalog-parametri.md' `
        -Original '| speed_delta_urban | 0 | -8–15 |' `
        -Replacement '| speed_delta_urban | 1 | -8–15 |' `
        -ExpectedError 'Catalogul Markdown diferă de JSON: speed_delta_urban'

    Test-PlanRejectsMutation -Name 'Catalogul respinge chei duplicate' `
        -RelativePath 'Docs/driving-parameters.json' `
        -Original '"key": "speed_delta_residential"' `
        -Replacement '"key": "speed_delta_urban"' `
        -ExpectedError 'Cheie catalog duplicată: speed_delta_urban'

    Test-PlanRejectsMutation -Name 'Planul respinge linkuri locale inexistente' `
        -RelativePath 'Docs/README.md' `
        -Original '(22-kpi-economie-si-review-uri.md)' `
        -Replacement '(modul-kpi-inexistent.md)' `
        -ExpectedError 'Link local rupt.*modul-kpi-inexistent'

    $planTestFinal = & $planTestValidator -ProjectRoot $planTestFixture | ConvertFrom-Json
    if (-not $planTestFinal.Valid) { throw 'Restaurarea fixture-ului a eșuat' }
    [ordered]@{
        Valid = $true
        Passed = $planTestPassed.Count
        Cases = @($planTestPassed)
        LivePlanModified = $false
    } | ConvertTo-Json -Depth 4
}
finally {
    if (Test-Path -LiteralPath $planTestFixture) {
        $planTestResolved = (Resolve-Path -LiteralPath $planTestFixture).Path
        if (-not $planTestResolved.StartsWith($planTestBoundary, [StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $planTestResolved) -ne $planTestName) {
            throw 'Refuz ștergerea unui fixture în afara țintei verificate'
        }
        Remove-Item -LiteralPath $planTestResolved -Recurse -Force
    }
}
