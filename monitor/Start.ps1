param([int]$UiPort = 3010, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
if ($UiPort -lt 1 -or $UiPort -gt 65535) { throw '端口必须在 1–65535 之间。' }
$base = $PSScriptRoot
$url = "http://127.0.0.1:$UiPort"
$last = Join-Path $base "data\ui-last.json"
try { $saved = Get-Content -LiteralPath $last -Raw | ConvertFrom-Json; $status = Invoke-RestMethod ($saved.url + "/api/status") -TimeoutSec 2; if ($status.startedAt -eq $saved.startedAt) { Write-Host ("监视台已运行：" + $saved.url); if (-not $NoBrowser) { Start-Process $saved.url }; exit 0 } } catch {}
try {
    $existing = Invoke-RestMethod "$url/api/status" -TimeoutSec 2
    if ($existing.url -eq $url -and $existing.startedAt) { Write-Host "监视台已运行：$url"; if (-not $NoBrowser) { Start-Process $url }; exit 0 }
} catch {}
$candidates = @((Join-Path $base 'node\node.exe'), 'D:\nodejs\node.exe', 'D:\Stronghold-Protocol\Stronghold-Protocol-20p.4\node\node.exe')
$node = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $node) { $node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source }
if (-not $node) { throw '未找到 Node.js。请安装 Node 22+，或把便携版 node.exe 放入本程序的 node 文件夹。' }
$nodeVersion = & $node --version
$major = $nodeVersion.TrimStart('v').Split('.')[0]
if ([int]$major -lt 22) { throw '需要 Node.js 22 或更高版本。' }
$env:MONITOR_UI_PORT = [string]$UiPort
$data = Join-Path $base 'data'
New-Item -ItemType Directory -Path $data -Force | Out-Null
$process = Start-Process -FilePath $node -ArgumentList @('"' + (Join-Path $base 'server.mjs') + '"') -WorkingDirectory $base -WindowStyle Hidden -RedirectStandardOutput (Join-Path $data 'ui-stdout.log') -RedirectStandardError (Join-Path $data 'ui-stderr.log') -PassThru
Write-Host "正在检测可用端口（首选 $UiPort）……"
$readyFile = Join-Path $data ("ui-ready-" + $process.Id + '.json')
for ($attempt = 0; $attempt -lt 60; $attempt++) {
    Start-Sleep -Milliseconds 500
    $process.Refresh()
    if ($process.HasExited) { Get-Content (Join-Path $data 'ui-stderr.log') -ErrorAction SilentlyContinue; throw '监视台启动失败，请检查 data\ui-stderr.log。' }
    if (Test-Path -LiteralPath $readyFile) {
      try {
        $ready = Get-Content -LiteralPath $readyFile -Raw | ConvertFrom-Json
        $status = Invoke-RestMethod ($ready.url + '/api/status') -TimeoutSec 1
        if ($ready.pid -eq $process.Id -and $status.startedAt -eq $ready.startedAt) {
          Get-Content (Join-Path $data 'ui-stdout.log') -Encoding UTF8
          Write-Host ("监视台已启动，当前端口：" + $ready.port + "；地址：" + $ready.url)
          if (-not $NoBrowser) { Start-Process $ready.url }
          exit 0
        }
      } catch {}
    }
}
throw '启动等待超时，请检查 data 文件夹中的运行日志。'
