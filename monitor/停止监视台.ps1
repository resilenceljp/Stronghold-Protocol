$ErrorActionPreference = 'Stop'
$pidFile = Join-Path $PSScriptRoot 'data\monitor.pid'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Host '没有记录中的监视台进程。'; exit 0 }
$monitorProcessId = [int](Get-Content -LiteralPath $pidFile)
$process = Get-CimInstance Win32_Process -Filter "ProcessId=$monitorProcessId"
$expectedPath = Join-Path $PSScriptRoot 'server.mjs'
if ($process -and $process.Name -eq 'node.exe' -and $process.CommandLine.Contains($expectedPath)) {
    Stop-Process -Id $monitorProcessId
    Write-Host '监视台已停止。游戏服务器继续运行。'
} elseif ($process) { throw '进程标识不匹配，未停止该进程。' }
Remove-Item -LiteralPath $pidFile -ErrorAction SilentlyContinue
