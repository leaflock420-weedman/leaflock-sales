$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$url = "http://127.0.0.1:8787/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($url)
$listener.Start()
Start-Process $url
Write-Host "LeafLock Pharmacy CRM running at $url"
Write-Host "Press Ctrl+C to stop."
$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
}
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $path = $ctx.Request.Url.LocalPath
  if ($path -eq "/") { $path = "/index.html" }
  $file = Join-Path $root ($path.TrimStart("/"))
  if (Test-Path $file -PathType Leaf) {
    $bytes = [System.IO.File]::ReadAllBytes($file)
    $ext = [System.IO.Path]::GetExtension($file)
    $ctx.Response.ContentType = $mime[$ext]
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $ctx.Response.StatusCode = 404
    $msg = [Text.Encoding]::UTF8.GetBytes("Not found")
    $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
  }
  $ctx.Response.Close()
}