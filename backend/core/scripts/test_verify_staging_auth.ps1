#requires -Version 5.1
# Offline checks for the smoke-check tool. Synthetic tokens/responses are NOT Firebase UAT.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'verify_staging_auth.ps1'
$parseTokens = $null
$parseErrors = $null
[void][System.Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$parseTokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw 'Smoke script syntax check failed.' }

function Expect-Failure([scriptblock] $Action, [string] $Message) {
    $failed = $false
    try { & $Action | Out-Null } catch {
        $failed = $true
        if ($_.Exception.Message -notlike "*$Message*") { throw 'Unexpected offline test failure category.' }
    }
    if (-not $failed) { throw 'Offline negative case unexpectedly passed.' }
}

. $scriptPath -BaseUrl '' -ProjectId '' -ShopAId 0 -ShopBId 0
Expect-Failure { & $scriptPath -BaseUrl '' -ProjectId '' -ShopAId 0 -ShopBId 0 } 'exact HTTPS staging origin'
foreach ($badUrl in @('http://localhost:8080', 'https://user:secret@example.test', 'https://example.test/api',
        'https://example.test?token=fake', 'https://example.test#fragment')) {
    Expect-Failure { & $scriptPath -BaseUrl $badUrl -ProjectId 'offline-project' -ShopAId 1 -ShopBId 2 } 'exact HTTPS staging origin'
}
Expect-Failure { & $scriptPath -BaseUrl 'https://example.test' -ProjectId 'offline-project' -ShopAId 1 -ShopBId 1 } 'two different positive'

$tokenVariable = 'CORE_STAGING_OFFLINE_FIXTURE_TOKEN'
$previousToken = [Environment]::GetEnvironmentVariable($tokenVariable, 'Process')
$ProjectId = 'offline-project'
try {
    [Environment]::SetEnvironmentVariable($tokenVariable, $null, 'Process')
    Expect-Failure { Read-TestToken $tokenVariable 'Fresh' } 'missing CORE_STAGING_OFFLINE_FIXTURE_TOKEN'
    [Environment]::SetEnvironmentVariable($tokenVariable, 'not-a-token', 'Process')
    Expect-Failure { Read-TestToken $tokenVariable 'Fresh' } 'required Fresh Firebase'
    $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $payloadJson = @{ aud = $ProjectId; iss = "https://securetoken.google.com/$ProjectId"; sub = 'offline-user'; exp = $now + 3600 } | ConvertTo-Json -Compress
    $payload = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($payloadJson)).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    [Environment]::SetEnvironmentVariable($tokenVariable, "e30.$payload.offline-signature", 'Process')
    $fixture = Read-TestToken $tokenVariable 'Fresh'
    if ($fixture.Subject -ne 'offline-user') { throw 'Fixture input parsing failed.' }
    Expect-Failure { Read-TestToken $tokenVariable 'WrongProject' } 'required WrongProject Firebase'
    Expect-Failure { Read-TestToken $tokenVariable 'Expired' } 'required Expired Firebase'
    foreach ($kind in @('WrongProject', 'Expired')) {
        $audience = if ($kind -eq 'WrongProject') { 'other-offline-project' } else { $ProjectId }
        $expiry = if ($kind -eq 'Expired') { $now - 3600 } else { $now + 3600 }
        $payloadJson = @{ aud = $audience; iss = "https://securetoken.google.com/$audience"; sub = 'offline-user'; exp = $expiry } | ConvertTo-Json -Compress
        $payload = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($payloadJson)).TrimEnd('=').Replace('+', '-').Replace('/', '_')
        [Environment]::SetEnvironmentVariable($tokenVariable, "e30.$payload.offline-signature", 'Process')
        $fixture = Read-TestToken $tokenVariable $kind
        if ($fixture.Subject -ne 'offline-user') { throw 'Negative-token fixture parsing failed.' }
        Expect-Failure { Read-TestToken $tokenVariable 'Fresh' } 'required Fresh Firebase'
    }
} finally {
    [Environment]::SetEnvironmentVariable($tokenVariable, $previousToken, 'Process')
}

Add-Type -AssemblyName System.Net.Http
$origin = 'https://offline.example.test'
$script:PassedChecks = 0
$client = [pscustomobject]@{ Status = 401; Json = '{"code":"unauthorized","traceId":"offline-trace"}'; Requests = 0 }
$client | Add-Member -MemberType ScriptMethod -Name SendAsync -Value {
    param($request)
    if ($request.Method.Method -ne 'GET') { throw 'Offline transport received a write request.' }
    $this.Requests++
    $response = [System.Net.Http.HttpResponseMessage]::new([System.Net.HttpStatusCode]$this.Status)
    $response.Content = [System.Net.Http.StringContent]::new($this.Json)
    $completion = [System.Threading.Tasks.TaskCompletionSource[System.Net.Http.HttpResponseMessage]]::new()
    $completion.SetResult($response)
    return $completion.Task
}
Test-CoreGet -Name 'Offline 401 contract' -Path '/api/v1/me' -ExpectedStatus 401 -ExpectedCode 'unauthorized' 6>$null
$client.Json = '{"code":"unauthorized"}'
Expect-Failure { Test-CoreGet -Name 'Missing trace' -Path '/api/v1/me' -ExpectedStatus 401 -ExpectedCode 'unauthorized' } 'expected Core error contract'
$client.Status = 302
$client.Json = '{}'
Expect-Failure { Test-CoreGet -Name 'Redirect' -Path '/api/v1/me' -ExpectedStatus 200 } 'received HTTP 302'
$client.Status = 200
$client.Json = '{"status":"DOWN"}'
Expect-Failure { Test-CoreGet -Name 'Unready' -Path '/actuator/health/readiness' -ExpectedStatus 200 } 'readiness is not UP'
$client.Json = '{"role":"OWNER","user":{"id":1},"shops":[{"id":7,"status":"ACTIVE"}]}'
Test-CoreGet -Name 'Offline OWNER fixture' -Path '/api/v1/me' -ExpectedStatus 200 -ExpectedRole 'OWNER' -ExpectedOwnedShop 7 6>$null
Expect-Failure { Test-CoreGet -Name 'Wrong role' -Path '/api/v1/me' -ExpectedStatus 200 -ExpectedRole 'ADMIN' } 'active ADMIN Core profile'
Expect-Failure { Test-CoreGet -Name 'Wrong shop' -Path '/api/v1/me' -ExpectedStatus 200 -ExpectedRole 'OWNER' -ExpectedOwnedShop 8 } 'selected ACTIVE shop'
$client.Json = '<html>not Core JSON</html>'
Expect-Failure { Test-CoreGet -Name 'Bad JSON' -Path '/api/v1/me' -ExpectedStatus 200 } 'Core JSON'
if ($script:PassedChecks -ne 2) { throw 'Failed checks incorrectly counted as successful.' }
Write-Host 'PASS: offline script syntax, fixture validation and response/redirect guards. No network or real Firebase tested.'
