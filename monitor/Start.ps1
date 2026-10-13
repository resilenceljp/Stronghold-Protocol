param([int]$UiPort = 3010, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$base = $PSScriptRoot
$url = "http://127.0.0.1:$UiPort"
try {
    $existing = Invoke-RestMethod "$url/api/status" -TimeoutSec 2
    if ($existing.url -eq $url -and $existing.startedAt) { if (-not $NoBrowser) { Start-Process $url }; exit 0 }
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
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 500
    if ($process.HasExited) { throw ('监视台启动失败，请检查 data\ui-stderr.log。退出码：' + $process.ExitCode) }
    try { $status = Invoke-RestMethod "$url/api/status" -TimeoutSec 1; if ($status.startedAt) { if (-not $NoBrowser) { Start-Process $url }; exit 0 } } catch {}
}
throw '启动等待超时，请检查 data 文件夹中的运行日志。'
