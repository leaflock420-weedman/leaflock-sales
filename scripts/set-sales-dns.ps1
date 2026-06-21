# Add sales CNAME on GoDaddy for Render
param(
    [string]$ApiKey = $env:GODADDY_API_KEY,
    [string]$ApiSecret = $env:GODADDY_API_SECRET,
    [string]$Target = "leaflock-sales.onrender.com"  # NOT leaflock.com.au
)

$domain = "leaflock.com.au"
$name = "sales"

if (-not $ApiKey -or -not $ApiSecret) {
    Write-Host "No GoDaddy API keys in environment." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Add manually in GoDaddy DNS for $domain :" -ForegroundColor Cyan
    Write-Host "  Type:  CNAME"
    Write-Host "  Name:  $name"
    Write-Host "  Value: $Target"
    Write-Host "  TTL:   600"
    exit 1
}

$headers = @{
    Authorization = "sso-key ${ApiKey}:${ApiSecret}"
    Accept = "application/json"
}

$body = @(@{ type = "CNAME"; name = $name; data = $Target; ttl = 600 }) | ConvertTo-Json

try {
    Invoke-RestMethod -Uri "https://api.godaddy.com/v1/domains/$domain/records/CNAME/$name" -Headers $headers -Method Put -Body $body -ContentType "application/json"
    Write-Host "Updated CNAME $name.$domain -> $Target" -ForegroundColor Green
} catch {
    Invoke-RestMethod -Uri "https://api.godaddy.com/v1/domains/$domain/records" -Headers $headers -Method Patch -Body $body -ContentType "application/json"
    Write-Host "Added CNAME $name.$domain -> $Target" -ForegroundColor Green
}