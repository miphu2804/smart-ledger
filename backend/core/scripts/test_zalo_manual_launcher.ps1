$ErrorActionPreference = 'Stop'
$coreDirectory = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
. (Join-Path $PSScriptRoot 'zalo-manual-runtime.ps1')

$runtime = New-ZaloManualRuntime -CoreDirectory $coreDirectory
$classes = @(Get-ChildItem -LiteralPath $runtime -Recurse -File -Filter '*.class')
if ($classes.Count -lt 1 -or @($classes | Where-Object {
    $_.Name -notmatch '^ZaloManualServer(\$.*)?\.class$'
}).Count -gt 0) {
    throw 'Runtime must contain only the manual entry point and its inner classes.'
}
if (Test-Path -LiteralPath (Join-Path $runtime 'application.properties')) {
    throw 'JUnit application properties must not enter the manual runtime.'
}
if (Test-Path -LiteralPath (Join-Path $runtime 'application.yml')) {
    throw 'JUnit application YAML must not enter the manual runtime.'
}
if (@(Get-ChildItem -LiteralPath $runtime -Recurse -File | Where-Object Extension -NE '.class').Count -ne 0) {
    throw 'Do not carry the retired test-only SQL fixture or other test resources into the runtime.'
}
$launcher = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'start-zalo-manual.ps1'))
if ($launcher.Contains('$classpath = "target/test-classes;')) {
    throw 'Launcher still includes the complete test classpath, including unrelated Spring configurations.'
}
Write-Host 'PASS: manual runtime includes entry point only; migrations come from production classes, no test configurations/resources.'
