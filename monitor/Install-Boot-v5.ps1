param([Parameter(Mandatory=$true)][string]$GameRoot)
$ErrorActionPreference = 'Stop'
$resolvedRoot = (Resolve-Path -LiteralPath $GameRoot).Path
$target = Join-Path $resolvedRoot 'server\http\boot.js'
if (-not (Test-Path -LiteralPath $target) -or -not (Test-Path -LiteralPath (Join-Path $resolvedRoot 'package.json'))) { throw 'GameRoot 必须是含 package.json 和 server\http\boot.js 的游戏根目录；整合包请选择 app 目录。' }
$source = Join-Path $PSScriptRoot 'compat\boot-universal-v5.js'
if (-not (Test-Path -LiteralPath $source)) { throw '缺少随包 boot v5 文件。' }
$backup = "$target.backup-$(Get-Date -Format yyyyMMdd-HHmmss-fff)"
Copy-Item -LiteralPath $target -Destination $backup
Copy-Item -LiteralPath $source -Destination $target
Write-Host "已安装 boot v5。备份：$backup"
Write-Host '请在合适时间手动重启游戏服务器，完整对局监控将在重启后生效。'
