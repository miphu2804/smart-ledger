#requires -Version 5.1
<#
.SYNOPSIS
Read-only authentication/shop-isolation smoke checks against an explicitly selected staging Core.
.DESCRIPTION
Requires existing OWNER A, OWNER B and ADMIN profiles, two ACTIVE shops, and real
Firebase ID tokens in CORE_STAGING_*_TOKEN process environment variables. No
sign-up, session creation, POST/PATCH/DELETE or database writes are performed.
JWT payload decoding below only validates test inputs; it never verifies a signature.
#>
[CmdletBinding()]
param(
    [string] $BaseUrl = $env:CORE_STAGING_URL,
    [string] $ProjectId = $env:CORE_STAGING_FIREBASE_PROJECT_ID,
    [long] $ShopAId = $env:CORE_STAGING_SHOP_A_ID,
    [long] $ShopBId = $env:CORE_STAGING_SHOP_B_ID,
    [ValidateRange(1, 60)] [int] $TimeoutSeconds = 20
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-Field($Object, [string] $Name) {
    if ($null -eq $Object) { return $null }
    $property = $Object.PSObject.Properties[$Name]
    if ($null -ne $property) { return $property.Value }
    return $null
}

function Read-TestToken([string] $Variable, [string] $Kind) {
    $token = [Environment]::GetEnvironmentVariable($Variable, 'Process')
    if ([string]::IsNullOrWhiteSpace($token)) {
        throw "Incomplete checks: missing $Variable. No token value is printed."
    }
    try {
        if ($token -notmatch '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$') { throw 'shape' }
        $payload = $token.Split('.')[1].Replace('-', '+').Replace('_', '/')
        $payload = $payload.PadRight($payload.Length + ((4 - $payload.Length % 4) % 4), '=')
        $claims = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload)) | ConvertFrom-Json
        $audience = Get-Field $claims 'aud'
        $issuer = Get-Field $claims 'iss'
        $subject = Get-Field $claims 'sub'
        $expiry = (Get-Field $claims 'exp') -as [double]
        if ($audience -isnot [string] -or [string]::IsNullOrWhiteSpace($audience) -or
                $issuer -ne "https://securetoken.google.com/$audience" -or
                [string]::IsNullOrWhiteSpace($subject) -or $null -eq $expiry) { throw 'claims' }
        $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
        if ($Kind -eq 'WrongProject') {
            if ($audience -eq $ProjectId -or $expiry -le $now + 60) { throw 'wrong project fixture' }
        } elseif ($Kind -eq 'Expired') {
            # Allow for clock skew: use a genuine staging token expired for at least ten minutes.
            if ($audience -ne $ProjectId -or $expiry -gt $now - 600) { throw 'expired fixture' }
        } elseif ($audience -ne $ProjectId -or $expiry -le $now + 60) { throw 'fresh staging fixture' }
    } catch {
        throw "Incomplete checks: $Variable is not the required $Kind Firebase ID-token fixture."
    }
    return [pscustomobject]@{ Token = $token; Subject = $subject }
}

function Test-CoreGet {
    param([string] $Name, [string] $Path, [string] $Token, [long] $ShopId,
        [int] $ExpectedStatus, [string] $ExpectedCode, [string] $ExpectedRole,
        [long] $ExpectedOwnedShop)
    $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Get, "$origin$Path")
    $response = $null
    try {
        if ($Token) { $request.Headers.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $Token) }
        if ($ShopId -gt 0) { [void]$request.Headers.TryAddWithoutValidation('X-Shop-Id', [string]$ShopId) }
        [void]$request.Headers.TryAddWithoutValidation('Accept', 'application/json')
        try {
            $response = $client.SendAsync($request).GetAwaiter().GetResult()
            $content = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        } catch {
            throw "FAIL: $Name could not complete (network/TLS/timeout). No response or token is printed."
        }
        if ([int]$response.StatusCode -ne $ExpectedStatus) {
            throw "FAIL: $Name expected HTTP $ExpectedStatus, received HTTP $([int]$response.StatusCode)."
        }
        try { $body = $content | ConvertFrom-Json } catch { throw "FAIL: $Name did not return Core JSON." }
        if ($ExpectedCode -and ((Get-Field $body 'code') -ne $ExpectedCode -or
                [string]::IsNullOrWhiteSpace((Get-Field $body 'traceId')))) {
            throw "FAIL: $Name did not return the expected Core error contract."
        }
        if ($ExpectedRole) {
            if ((Get-Field $body 'role') -ne $ExpectedRole -or
                    (Get-Field (Get-Field $body 'user') 'id') -le 0) {
                throw "FAIL: $Name requires an existing active $ExpectedRole Core profile."
            }
            if ($ExpectedOwnedShop -gt 0) {
                $matches = @((Get-Field $body 'shops') | Where-Object {
                    (Get-Field $_ 'id') -eq $ExpectedOwnedShop -and (Get-Field $_ 'status') -eq 'ACTIVE'
                })
                if ($matches.Count -ne 1) { throw "FAIL: $Name requires the selected ACTIVE shop owned by that user." }
            }
        }
        if ($Path -eq '/actuator/health/readiness' -and (Get-Field $body 'status') -ne 'UP') {
            throw 'FAIL: readiness is not UP.'
        }
        $script:PassedChecks++
        Write-Host "PASS: $Name (HTTP $ExpectedStatus)"
    } finally {
        if ($null -ne $response) { $response.Dispose() }
        $request.Dispose()
    }
}

# Dot-sourcing is for offline helper tests only; it never executes a staging run.
if ($MyInvocation.InvocationName -eq '.') { return }

$uri = $null
if ([string]::IsNullOrWhiteSpace($BaseUrl) -or -not [Uri]::TryCreate($BaseUrl, [UriKind]::Absolute, [ref]$uri) -or
        $uri.Scheme -ne 'https' -or -not $uri.Host -or $uri.UserInfo -or $uri.Query -or $uri.Fragment -or
        $uri.AbsolutePath -ne '/') {
    throw 'Incomplete checks: CORE_STAGING_URL/BaseUrl must be an exact HTTPS staging origin, without credentials/path/query/fragment.'
}
if ([string]::IsNullOrWhiteSpace($ProjectId) -or $ShopAId -le 0 -or $ShopBId -le 0 -or $ShopAId -eq $ShopBId) {
    throw 'Incomplete checks: supply the staging Firebase project ID and two different positive ACTIVE shop IDs.'
}
# Validate every fixture before sending any request. Never substitute mocks for missing real tokens.
$ownerA = Read-TestToken 'CORE_STAGING_OWNER_A_TOKEN' 'Fresh'
$ownerB = Read-TestToken 'CORE_STAGING_OWNER_B_TOKEN' 'Fresh'
$admin = Read-TestToken 'CORE_STAGING_ADMIN_TOKEN' 'Fresh'
$wrongProject = Read-TestToken 'CORE_STAGING_WRONG_PROJECT_TOKEN' 'WrongProject'
$expired = Read-TestToken 'CORE_STAGING_EXPIRED_TOKEN' 'Expired'
if ($ownerA.Subject -eq $ownerB.Subject -or $ownerA.Subject -eq $admin.Subject -or $ownerB.Subject -eq $admin.Subject) {
    throw 'Incomplete checks: OWNER A, OWNER B and ADMIN must be different Firebase users.'
}

Add-Type -AssemblyName System.Net.Http
$handler = [System.Net.Http.HttpClientHandler]::new()
$handler.AllowAutoRedirect = $false
$handler.UseCookies = $false
$client = [System.Net.Http.HttpClient]::new($handler)
$client.Timeout = [TimeSpan]::FromSeconds($TimeoutSeconds)
$client.MaxResponseContentBufferSize = 1MB
$origin = $BaseUrl.TrimEnd('/')
$script:PassedChecks = 0
try {
    Test-CoreGet -Name 'Readiness' -Path '/actuator/health/readiness' -ExpectedStatus 200
    Test-CoreGet -Name 'Missing token' -Path '/api/v1/me' -ExpectedStatus 401 -ExpectedCode 'unauthorized'
    Test-CoreGet -Name 'Wrong Firebase project' -Path '/api/v1/me' -Token $wrongProject.Token -ExpectedStatus 401 -ExpectedCode 'unauthorized'
    Test-CoreGet -Name 'Expired staging token' -Path '/api/v1/me' -Token $expired.Token -ExpectedStatus 401 -ExpectedCode 'unauthorized'
    Test-CoreGet -Name 'OWNER A session' -Path '/api/v1/me' -Token $ownerA.Token -ExpectedStatus 200 -ExpectedRole 'OWNER' -ExpectedOwnedShop $ShopAId
    Test-CoreGet -Name 'OWNER B session' -Path '/api/v1/me' -Token $ownerB.Token -ExpectedStatus 200 -ExpectedRole 'OWNER' -ExpectedOwnedShop $ShopBId
    Test-CoreGet -Name 'ADMIN session' -Path '/api/v1/me' -Token $admin.Token -ExpectedStatus 200 -ExpectedRole 'ADMIN'
    foreach ($endpoint in @('products', 'categories', 'customers', 'sale-drafts', 'sales', 'debts', 'expenses', 'reports/summary', 'audit-logs')) {
        $path = "/api/v1/$endpoint"
        Test-CoreGet -Name "OWNER A own-shop $endpoint" -Path $path -Token $ownerA.Token -ShopId $ShopAId -ExpectedStatus 200
        Test-CoreGet -Name "OWNER B own-shop $endpoint" -Path $path -Token $ownerB.Token -ShopId $ShopBId -ExpectedStatus 200
        Test-CoreGet -Name "OWNER A cross-shop $endpoint" -Path $path -Token $ownerA.Token -ShopId $ShopBId -ExpectedStatus 403 -ExpectedCode 'shop_access_denied'
        Test-CoreGet -Name "OWNER B cross-shop $endpoint" -Path $path -Token $ownerB.Token -ShopId $ShopAId -ExpectedStatus 403 -ExpectedCode 'shop_access_denied'
        Test-CoreGet -Name "ADMIN denied OWNER $endpoint" -Path $path -Token $admin.Token -ShopId $ShopAId -ExpectedStatus 403 -ExpectedCode 'shop_access_denied'
    }
    Test-CoreGet -Name 'OWNER A denied other shop profile' -Path "/api/v1/shops/$ShopBId" -Token $ownerA.Token -ExpectedStatus 403 -ExpectedCode 'shop_access_denied'
    Test-CoreGet -Name 'OWNER B denied other shop profile' -Path "/api/v1/shops/$ShopAId" -Token $ownerB.Token -ExpectedStatus 403 -ExpectedCode 'shop_access_denied'
    if ($script:PassedChecks -ne 54) { throw 'FAIL: the read-only authentication matrix is incomplete.' }
    Write-Host "PASS: $script:PassedChecks/54 read-only auth/shop checks. FE, money writes and ADMIN mutations are NOT covered."
} finally {
    $client.Dispose()
}
