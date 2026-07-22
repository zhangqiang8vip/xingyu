$ErrorActionPreference = "Stop"
$projectPath = $PSScriptRoot
$outLog = Join-Path $projectPath "self-test-out.log"
$errorLog = Join-Path $projectPath "self-test-error.log"
$resultLog = Join-Path $projectPath "self-test-result.log"
$imagePath = Join-Path $projectPath ".self-test.png"

$env:NO_PROXY = "localhost,127.0.0.1,::1"
$env:no_proxy = "localhost,127.0.0.1,::1"

$server = Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "dev") `
  -WorkingDirectory $projectPath -WindowStyle Hidden `
  -RedirectStandardOutput $outLog -RedirectStandardError $errorLog -PassThru

try {
  $status = $null
  foreach ($attempt in 1..16) {
    Start-Sleep -Milliseconds 750
    $status = & curl.exe --noproxy 127.0.0.1 --connect-timeout 1 --max-time 2 -sS -o NUL -w "%{http_code}" "http://127.0.0.1:3000/"
    if ($status -eq "200") { break }
  }

  [IO.File]::WriteAllBytes($imagePath, [Convert]::FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="))
  $uploadJson = & curl.exe --noproxy 127.0.0.1 -sS -F "file=@$imagePath;type=image/png" "http://127.0.0.1:3000/api/media"
  $upload = $uploadJson | ConvertFrom-Json
  $mediaStatus = & curl.exe --noproxy 127.0.0.1 -sS -o NUL -w "%{http_code}" "http://127.0.0.1:3000$($upload.url)"
  @(
    "FRONT_HTTP_STATUS=$status"
    "UPLOAD_URL=$($upload.url)"
    "MEDIA_HTTP_STATUS=$mediaStatus"
    "SERVER_PID=$($server.Id)"
  ) | Set-Content -LiteralPath $resultLog
  Get-Content $resultLog
  if (Test-Path $outLog) { Get-Content $outLog -Tail 40 }
  if (Test-Path $errorLog) { Get-Content $errorLog -Tail 40 }

  if ($status -ne "200") { exit 1 }
} finally {
  Remove-Item -LiteralPath $imagePath -Force -ErrorAction SilentlyContinue
  if (-not $server.HasExited) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
}
