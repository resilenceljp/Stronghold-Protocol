param(
    [Parameter(Mandatory=$true)][ValidatePattern('^\d+\.\d+(\.\d+)?$')][string]$Version,
    [string]$CopyDirectory = 'D:\Stronghold-Protocol'
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$base = (Resolve-Path -LiteralPath $PSScriptRoot).Path
$outputDirectory = Split-Path $base -Parent
$zipPath = Join-Path $outputDirectory "Stronghold-Monitor-UI-v$Version-boot-v13.zip"
$privatePrefix = (Join-Path $base 'data') + [IO.Path]::DirectorySeparatorChar
$stream = [IO.File]::Open($zipPath, [IO.FileMode]::Create)
try {
    $archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create, $true)
    try {
        foreach ($file in Get-ChildItem -LiteralPath $base -Recurse -File) {
            if ($file.FullName.StartsWith($privatePrefix, [StringComparison]::OrdinalIgnoreCase)) { continue }
            $relative = $file.FullName.Substring($base.Length + 1).Replace('\','/')
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, "Stronghold-Monitor-UI/$relative", [IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    } finally { $archive.Dispose() }
} finally { $stream.Dispose() }
New-Item -ItemType Directory -Path $CopyDirectory -Force | Out-Null
$bootAlias = Join-Path $CopyDirectory 'boot.js'
$bootSource = Join-Path $base 'compat\boot-universal-v13.js'
if ((Test-Path -LiteralPath $bootAlias) -and (Get-FileHash -LiteralPath $bootAlias).Hash -ne (Get-FileHash -LiteralPath $bootSource).Hash) {
    Copy-Item -LiteralPath $bootAlias -Destination "$bootAlias.backup-$(Get-Date -Format yyyyMMdd-HHmmss-fff)"
}
Copy-Item -LiteralPath $bootSource -Destination $bootAlias -Force
Copy-Item -LiteralPath $bootSource -Destination (Join-Path $CopyDirectory 'boot-universal-v13.js') -Force
Copy-Item -LiteralPath (Join-Path $base 'compat\monitorBoot.js') -Destination (Join-Path $CopyDirectory 'monitorBoot.js') -Force
Copy-Item -LiteralPath (Join-Path $base 'compat\monitor-v6.js') -Destination (Join-Path $CopyDirectory 'monitor-v6.js') -Force
Copy-Item -LiteralPath (Join-Path $base 'compat\traffic-ledger.js') -Destination (Join-Path $CopyDirectory 'traffic-ledger.js') -Force
Copy-Item -LiteralPath (Join-Path $base 'compat\room-control.js') -Destination (Join-Path $CopyDirectory 'room-control.js') -Force
Copy-Item -LiteralPath $zipPath -Destination (Join-Path $CopyDirectory ([IO.Path]::GetFileName($zipPath))) -Force
Copy-Item -LiteralPath $zipPath -Destination (Join-Path $CopyDirectory 'Stronghold-Monitor-UI-latest.zip') -Force
Write-Host "已生成：$zipPath"
Write-Host "boot、辅助模块和 ZIP 已同步到：$CopyDirectory"
