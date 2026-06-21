$ErrorActionPreference = "Stop"
$env:Path = "C:\Program Files\Git\cmd;C:\Program Files\nodejs;" + $env:Path
Set-Location $PSScriptRoot

$repo = "https://github.com/leaflock420-weedman/leaflock-sales.git"

if (-not (Test-Path .git)) {
    git init
    git branch -M main
}

git add .
git commit -m "LeafLock Sales CRM — live deploy" 2>$null

if (-not (git remote get-url origin 2>$null)) {
    git remote add origin $repo
}

Write-Host "Pushing to GitHub..." -ForegroundColor Cyan
git push -u origin main

Write-Host ""
Write-Host "Next: Render.com -> New -> Blueprint -> connect leaflock-sales repo" -ForegroundColor Green
Write-Host "Or open existing Blueprint and sync." -ForegroundColor Green
Write-Host ""
Write-Host "DNS (GoDaddy):" -ForegroundColor Cyan
Write-Host "  CNAME  sales  ->  leaflock-sales.onrender.com"
Write-Host ""
Write-Host "Run: .\scripts\set-sales-dns.ps1  (if GoDaddy API keys are set)" -ForegroundColor Yellow