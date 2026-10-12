# Sync nft-generator-prototype to koko-app assets offline package directory
# Usage: powershell -ExecutionPolicy Bypass -File sync-miniapp.ps1
$ErrorActionPreference = 'Stop'
$src = "c:\官网html\KOKO\nft-generator-prototype"
$dst = "C:\Projects\koko-app\assets\miniapps\nft-generator"
if (-not (Test-Path $src)) { throw "Source dir not found: $src" }
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Get-ChildItem $src -File | ForEach-Object {
    Copy-Item $_.FullName "$dst\$($_.Name)" -Force
    Write-Host "synced: $($_.Name)"
}
Write-Host "Done. Total $((Get-ChildItem $dst -File).Count) files."
