$src = Join-Path $env:LOCALAPPDATA "Google\Chrome\User Data"
$dst = Join-Path (Split-Path $PSScriptRoot -Parent) ".chrome-jsonbin-profile"

if (-not (Test-Path $src)) {
    Write-Host "Chrome profile not found" -ForegroundColor Red
    exit 1
}

if (Test-Path $dst) {
    Remove-Item $dst -Recurse -Force -ErrorAction SilentlyContinue
}

New-Item -ItemType Directory -Path $dst -Force | Out-Null
$exclude = @("Cache", "Code Cache", "GPUCache", "Service Worker", "ShaderCache", "GrShaderCache", "BrowserMetrics")
$items = Get-ChildItem $src -Force
foreach ($item in $items) {
    if ($exclude -contains $item.Name) { continue }
    Copy-Item $item.FullName -Destination (Join-Path $dst $item.Name) -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Profile copied to $dst" -ForegroundColor Green