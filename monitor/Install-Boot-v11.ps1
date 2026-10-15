param([Parameter(Mandatory=$true)][string]$GameRoot)
$ErrorActionPreference='Stop'
$resolvedRoot=(Resolve-Path -LiteralPath $GameRoot).Path
if(-not(Test-Path -LiteralPath (Join-Path $resolvedRoot 'package.json'))){throw '请选择游戏根目录。'}
$stamp=Get-Date -Format yyyyMMdd-HHmmss-fff
$items=@(@{Source='boot-universal-v11.js';Target='boot.js'},@{Source='monitor-v6.js';Target='monitor-v6.js'},@{Source='traffic-ledger.js';Target='traffic-ledger.js'},@{Source='room-control.js';Target='room-control.js'})
$backups=@{}
foreach($item in $items){
 $source=Join-Path $PSScriptRoot ('compat\'+$item.Source)
 if(-not(Test-Path -LiteralPath $source)){throw "缺少模块：$source"}
 $target=Join-Path $resolvedRoot ('server\http\'+$item.Target)
 if(Test-Path -LiteralPath $target){$backup="$target.backup-$stamp";Copy-Item -LiteralPath $target -Destination $backup;$backups[$target]=$backup}
}
try{foreach($item in $items){Copy-Item -LiteralPath (Join-Path $PSScriptRoot ('compat\'+$item.Source)) -Destination (Join-Path $resolvedRoot ('server\http\'+$item.Target)) -Force}}
catch{foreach($target in $backups.Keys){Copy-Item -LiteralPath $backups[$target] -Destination $target -Force};throw}
Write-Host '已安装 boot v11、监控模块与流量账本模块。下次启动游戏服后生效；不要中断正在进行的对局。'
