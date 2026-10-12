param([Parameter(Mandatory=$true)][string]$GameRoot)
$ErrorActionPreference = 'Stop'
$resolvedRoot = (Resolve-Path -LiteralPath $GameRoot).Path
$target = Join-Path $resolvedRoot 'server\http\boot.js'
$moduleTarget = Join-Path $resolvedRoot 'server\http\monitor-v6.js'
if (-not (Test-Path -LiteralPath $target) -or -not (Test-Path -LiteralPath (Join-Path $resolvedRoot 'package.json'))) { throw 'GameRoot 必须是含 package.json 和 server\http\boot.js 的游戏根目录；整合包请选择 app 目录。' }
$source = Join-Path $PSScriptRoot 'compat\boot-universal-v6.js'
$moduleSource = Join-Path $PSScriptRoot 'compat\monitor-v6.js'
if (-not (Test-Path -LiteralPath $source) -or -not (Test-Path -LiteralPath $moduleSource)) { throw '缺少随包 boot v6 或 monitor-v6.js。' }
$stamp = Get-Date -Format yyyyMMdd-HHmmss-fff
$backup = "$target.backup-$stamp"
Copy-Item -LiteralPath $target -Destination $backup
$moduleBackup = $null
if (Test-Path -LiteralPath $moduleTarget) { $moduleBackup = "$moduleTarget.backup-$stamp"; Copy-Item -LiteralPath $moduleTarget -Destination $moduleBackup }
try {
    Copy-Item -LiteralPath $moduleSource -Destination $moduleTarget
    Copy-Item -LiteralPath $source -Destination $target
} catch {
    Copy-Item -LiteralPath $backup -Destination $target
    if ($moduleBackup) { Copy-Item -LiteralPath $moduleBackup -Destination $moduleTarget }
    throw
}
Write-Host "已安装 boot v6 和监控模块。boot 备份：$backup"
Write-Host '手动启动游戏服务器后生效；阵容在每回合休整结束时首次保存。'
