param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Database', 'Core', 'Gateway')]
    [string]$Mode,
    [string]$ConfigFile
)

$ErrorActionPreference = 'Stop'
$coreDirectory = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$manualContainer = 'smartledger-zalo-manual'
$manualLabel = 'smartledger.purpose=zalo-manual-disposable'
. (Join-Path $PSScriptRoot 'zalo-manual-runtime.ps1')

function Read-ManualConfig {
    if (-not $ConfigFile -or -not (Test-Path -LiteralPath $ConfigFile -PathType Leaf)) {
        throw 'Pass -ConfigFile with the private .env file described in docs/zalo-manual-login.md.'
    }
    $allowed = @('ZALO_MANUAL_ORIGIN', 'ZALO_APP_ID', 'ZALO_APP_SECRET',
        'ZALO_MANUAL_FIREBASE_CREDENTIALS', 'ZALO_MANUAL_CONFIRM_FIREBASE_STAGING')
    $values = @{}
    foreach ($line in [System.IO.File]::ReadAllLines((Resolve-Path -LiteralPath $ConfigFile).Path)) {
        if (-not $line.Trim() -or $line.TrimStart().StartsWith('#')) { continue }
        $pair = $line.Split('=', 2)
        if ($pair.Count -ne 2 -or $allowed -notcontains $pair[0].Trim()) {
            throw 'Unexpected configuration field. Use the manual example; do not load normal Core DB variables.'
        }
        $name = $pair[0].Trim()
        if ($values.ContainsKey($name)) { throw 'Duplicate manual configuration field.' }
        $value = $pair[1].Trim()
        if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'")))) { $value = $value.Substring(1, $value.Length - 2) }
        $values[$name] = $value
    }
    return $values
}

function Assert-ManualContainer {
    $inspection = & docker container inspect $manualContainer 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Create the isolated database first with -Mode Database.' }
    $container = ($inspection | ConvertFrom-Json)[0]
    $port = $container.HostConfig.PortBindings.'5432/tcp'
    $expectedEnvironment = @('POSTGRES_DB=zalo_manual', 'POSTGRES_USER=zalo_manual',
        'POSTGRES_PASSWORD=zalo_manual_disposable_only')
    if ($container.Config.Labels.'smartledger.purpose' -ne 'zalo-manual-disposable' -or
        $container.Mounts.Count -ne 0 -or
        @($container.HostConfig.Tmpfs.PSObject.Properties).Count -ne 1 -or
        @($container.HostConfig.Tmpfs.PSObject.Properties.Name) -notcontains '/var/lib/postgresql/data' -or
        $port.Count -ne 1 -or
        $port[0].HostIp -ne '127.0.0.1' -or $port[0].HostPort -ne '55449' -or
        @($expectedEnvironment | Where-Object { $container.Config.Env -notcontains $_ }).Count -ne 0) {
        throw 'Container name is occupied by an unexpected configuration. No changes made.'
    }
    return $container
}

Push-Location $coreDirectory
$savedEnvironment = @{}
try {
    if ($Mode -eq 'Gateway') {
        $config = Read-ManualConfig
        # Pass only the public origin; do not give the gateway the Zalo/Firebase server credentials.
        $savedEnvironment['ZALO_MANUAL_ORIGIN'] = [Environment]::GetEnvironmentVariable('ZALO_MANUAL_ORIGIN', 'Process')
        $env:ZALO_MANUAL_ORIGIN = $config['ZALO_MANUAL_ORIGIN']
        & node scripts/zalo-manual-server.mjs
        if ($LASTEXITCODE -ne 0) { throw 'Manual gateway did not start.' }
        return
    }

    & docker info --format '{{.ServerVersion}}' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop first.' }
    if ($Mode -eq 'Database') {
        $existing = & docker ps -a --filter "name=^/$manualContainer`$" --format '{{.Names}}'
        if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect Docker containers.' }
        if (-not $existing) {
            # tmpfs avoids a persistent/anonymous database volume. Nothing is mounted from the host.
            & docker run -d --name $manualContainer --label $manualLabel `
                -p '127.0.0.1:55449:5432' --tmpfs /var/lib/postgresql/data `
                -e POSTGRES_DB=zalo_manual -e POSTGRES_USER=zalo_manual `
                -e POSTGRES_PASSWORD=zalo_manual_disposable_only postgres:16-alpine | Out-Null
            if ($LASTEXITCODE -ne 0) { throw 'Cannot create isolated PostgreSQL.' }
        }
        $container = Assert-ManualContainer
        if (-not $container.State.Running) {
            & docker start $manualContainer | Out-Null
            if ($LASTEXITCODE -ne 0) { throw 'Cannot start isolated PostgreSQL.' }
        }
        $ready = $false
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            & docker exec $manualContainer pg_isready -U zalo_manual -d zalo_manual 2>$null | Out-Null
            if ($LASTEXITCODE -eq 0) { $ready = $true; break }
            Start-Sleep -Seconds 1
        }
        if (-not $ready) { throw 'Isolated PostgreSQL did not become ready.' }
    } else {
        $container = Assert-ManualContainer
        if (-not $container.State.Running) { throw 'Run -Mode Database first.' }
    }

    if ($Mode -eq 'Core') {
        $config = Read-ManualConfig
        foreach ($required in @('ZALO_MANUAL_ORIGIN', 'ZALO_APP_ID', 'ZALO_APP_SECRET', 'ZALO_MANUAL_FIREBASE_CREDENTIALS')) {
            if ([string]::IsNullOrWhiteSpace($config[$required])) {
                throw 'Fill all required fields in the private manual .env file before starting Core.'
            }
        }
        foreach ($name in $config.Keys) {
            $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
            [Environment]::SetEnvironmentVariable($name, $config[$name], 'Process')
        }
    }
    & .\mvnw.cmd -q -DskipTests test-compile dependency:build-classpath '-Dmdep.outputFile=target/zalo-manual-classpath.txt'
    if ($LASTEXITCODE -ne 0) { throw 'Cannot compile the manual Core entry point.' }
    $dependencies = [System.IO.File]::ReadAllText((Join-Path $coreDirectory 'target/zalo-manual-classpath.txt')).Trim()
    $manualRuntime = New-ZaloManualRuntime -CoreDirectory $coreDirectory
    $classpath = "target/classes;$manualRuntime;$dependencies"
    if ($Mode -eq 'Database') {
        & java -cp $classpath com.smartledger.core.manual.ZaloManualServer --check-db
    } else {
        Write-Host 'Core test binds 127.0.0.1:18081, database 127.0.0.1:55449/zalo_manual only.'
        & java -cp $classpath com.smartledger.core.manual.ZaloManualServer
    }
    if ($LASTEXITCODE -ne 0) { throw 'Manual Core check/start failed. No credentials displayed.' }
} finally {
    foreach ($name in $savedEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process')
    }
    Pop-Location
}
