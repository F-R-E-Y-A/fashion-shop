#Requires -Version 7.2
# tools/db/backup-db.ps1 — sao luu CSDL PostgreSQL o xa (staging tren Render) ra file .dump ngoai kho ma.
# Dung (PowerShell 7, Docker Desktop dang chay, dung o goc kho):
#   ./tools/db/backup-db.ps1 [-OutDir <thu muc ngoai kho>]
# URL chi nhap qua o che ky tu (Read-Host -MaskInput): khong nhan qua tham so de khong lot vao lich su
# lenh, khong in, khong ghi ra dia. Chay truc tiep, khong dot-source, de bien URL mat khi script ket thuc.
# Huong dan: docs/features/platform/staging.md muc "Du lieu va backup". Ham loi: pg-backup.psm1.
[CmdletBinding()]
param(
  # Mac dinh ../work/backups/staging-db canh thu muc kho chinh; tu choi thu muc nam trong kho.
  [string]$OutDir
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'pg-backup.psm1') -Force

$url = Read-Host -MaskInput 'External Database URL cua CSDL nguon'
try {
  $target = Get-PgTargetInfo -DatabaseUrl $url
  Write-Host "Sao luu '$($target.Database)' tren $($target.Host) (sslmode $($target.SslMode)) ..."
  $summary = Backup-PgDatabase -DatabaseUrl $url -OutDir $OutDir
} finally {
  $url = $null
}
$summary | Format-List | Out-Host
Write-Host 'Ghi lai File, Sha256 va SourceRows: sau khi khoi phuc, so SourceRows voi TargetRows.'
