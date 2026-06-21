$ErrorActionPreference = "Stop"
$chrome = "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chrome)) {
    $chrome = "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
}
if (-not (Test-Path $chrome)) {
    Write-Host "Chrome not found." -ForegroundColor Red
    exit 1
}

$userData = "$env:LOCALAPPDATA\Google\Chrome\User Data"
$port = 9222

$existing = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Chrome debug port $port already in use." -ForegroundColor Green
    exit 0
}

Write-Host "Starting Chrome with remote debugging on port $port..." -ForegroundColor Cyan
Write-Host "Using your normal Chrome profile (GoDaddy/Render logins)." -ForegroundColor Yellow

Start-Process $chrome -ArgumentList @(
    "--remote-debugging-port=$port",
    "--user-data-dir=`"$userData`"",
    "--profile-directory=Default",
    "https://dcc.godaddy.com/control/dnsmanagement?domainName=leaflock.com.au"
)