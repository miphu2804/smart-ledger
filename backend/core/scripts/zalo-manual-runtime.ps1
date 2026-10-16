# Keep unrelated test @Configuration classes off the manual application's classpath.
function New-ZaloManualRuntime {
    param([Parameter(Mandatory = $true)][string]$CoreDirectory)

    $sourceDirectory = Join-Path $CoreDirectory 'target/test-classes/com/smartledger/core/manual'
    $entryPoint = Join-Path $sourceDirectory 'ZaloManualServer.class'
    if (-not (Test-Path -LiteralPath $entryPoint -PathType Leaf)) {
        throw 'Compile the manual entry point first.'
    }
    # A new directory per launch avoids accidentally reusing old test configurations/resources.
    $runtime = Join-Path $CoreDirectory ('target/zalo-manual/runtime-' + [Guid]::NewGuid().ToString('N'))
    $packageDirectory = Join-Path $runtime 'com/smartledger/core/manual'
    New-Item -ItemType Directory -Path $packageDirectory -Force | Out-Null
    foreach ($file in Get-ChildItem -LiteralPath $sourceDirectory -File -Filter 'ZaloManualServer*.class') {
        if ($file.Name -match '^ZaloManualServer(\$.*)?\.class$') {
            Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $packageDirectory $file.Name)
        }
    }
    return $runtime
}
