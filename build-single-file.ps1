$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $env:USERPROFILE "OneDrive\Desktop\LeafLock_Sales.html"
$utf8 = New-Object System.Text.UTF8Encoding $false

$html = [System.IO.File]::ReadAllText((Join-Path $root "index.html"))
$css = [System.IO.File]::ReadAllText((Join-Path $root "styles.css"))
$config = [System.IO.File]::ReadAllText((Join-Path $root "config.js"))
$seed = [System.IO.File]::ReadAllText((Join-Path $root "seed.js"))
$sync = [System.IO.File]::ReadAllText((Join-Path $root "sync.js"))
$app = [System.IO.File]::ReadAllText((Join-Path $root "app.js"))

$html = $html -replace '<link rel="stylesheet" href="styles.css">', "<style>`n$css`n</style>"
$html = $html -replace '<script src="config.js" defer></script>', "<script>`n$config`n</script>"
$html = $html -replace '<script src="seed.js" defer></script>', "<script>`n$seed`n</script>"
$html = $html -replace '<script src="sync.js" defer></script>', "<script>`n$sync`n</script>"
$html = $html -replace '<script src="app.js" defer></script>', "<script>`n$app`n</script>"
$html = $html -replace '<link rel="manifest" href="manifest.json">\s*', ''
$html = $html -replace '<link rel="icon"[^>]+>\s*', ''
$html = $html -replace '<link rel="apple-touch-icon"[^>]+>\s*', ''
$html = $html -replace '<img class="brand-icon"[^>]+>', '<div class="brand-icon" aria-hidden="true">LL</div>'
$html = $html -replace '(?s)<script>\s*if \("serviceWorker".*?</script>', ''

[System.IO.File]::WriteAllText($out, $html, $utf8)
Write-Host "Built: $out ($((Get-Item $out).Length) bytes)"