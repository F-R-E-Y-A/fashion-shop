#Requires -Version 7.2
# tools/db/restore-db.ps1 — khoi phuc file .dump vao CSDL PostgreSQL DICH (vd DB moi truoc khi DB Free het han).
# Dung (PowerShell 7, Docker Desktop dang chay, dung o goc kho):
#   ./tools/db/restore-db.ps1 -DumpFile <file .dump> [-Force]
# Mac dinh dung lai neu DB dich da co bang trong public/staging/reporting. -Force xoa va tao lai cac doi
# tuong co trong file dump (--clean --if-exists), chi chay sau khi go lai '<nhan dau cua host>/<ten DB>'.
# URL chi nhap qua o che ky tu, khong nhan qua tham so, khong in, khong ghi ra dia.
# Huong dan: docs/features/platform/staging.md muc "Du lieu va backup". Ham loi: pg-backup.psm1.
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$DumpFile,
  [switch]$Force
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'pg-backup.psm1') -Force

$url = Read-Host -MaskInput 'Database URL cua CSDL DICH (DB moi, khong phai nguon)'
try {
  $target = Get-PgTargetInfo -DatabaseUrl $url
  Write-Host "Khoi phuc $DumpFile vao '$($target.Database)' tren $($target.Host) (sslmode $($target.SslMode))."
  if ($Force) {
    # DB cu va DB moi tao tu cung Blueprint trung ten DB (render.yaml:66): chi go ten DB thi khong phan
    # biet duoc, nen bat go ca nhan dau cua host (moi instance Render mot host rieng).
    $expected = '{0}/{1}' -f $target.Host.Split('.')[0], $target.Database
    $typed = Read-Host "-Force se XOA roi tao lai moi bang co trong file dump. Go '$expected' de tiep tuc"
    if ($typed -cne $expected) { throw 'Go khong khop, dung lai, chua cham DB dich.' }
  }
  $result = Restore-PgDatabase -DatabaseUrl $url -DumpFile $DumpFile -Force:$Force
} finally {
  $url = $null
}
$result | Format-List | Out-Host
if ($result.Messages) { Write-Host 'Thong bao cua pg_restore:'; $result.Messages | Out-Host }
Write-Host 'So TargetRows voi SourceRows ghi luc sao luu; lech thi chua tro API sang DB nay.'
