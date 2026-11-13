# tools/db/pg-backup.psm1 — ham loi sao luu va khoi phuc PostgreSQL bang pg_dump/pg_restore 17 trong image
# postgres:17-alpine co san tren may, khong can cai PostgreSQL. Nguoi dung goi qua backup-db.ps1 va
# restore-db.ps1; cac ham o day nhan URL lam tham so (khong tu hoi) de kiem duoc voi CSDL local.
# URL chua mat khau: khong bao gio in ra, khong dua vao thong bao loi, khong ghi ra dia.
# Huong dan: docs/features/platform/staging.md muc "Du lieu va backup".
#Requires -Version 7.2
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:Image = 'postgres:17-alpine'
# Ba schema Prisma quan ly (apps/api/prisma/schema/base.prisma:22). Co bang o day nghia la DB da co du lieu.
$script:AppSchemas = @('public', 'staging', 'reporting')
# Bang dem dong de so nguon voi dich sau khi khoi phuc.
$script:KeyTables = @('products', 'product_variants', 'users', 'orders')

function ConvertTo-PgEnv {
  # Tach URL thanh bien libpq (PGHOST, PGPASSWORD...) de pg_dump/psql/pg_restore doc tu env: mat khau
  # khong nam trong tham so dong lenh cua docker, cung khong nam trong tham so cua lenh trong container.
  # Khong dung [Parameter(Mandatory)]: thieu tham so thi PowerShell tu hoi va hien chu ro khi go.
  param([string]$DatabaseUrl)
  if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) { throw 'Chua nhap database URL.' }
  $uri = $null
  $text = $DatabaseUrl.Trim().Trim('"', "'")
  if (-not [Uri]::TryCreate($text, [UriKind]::Absolute, [ref]$uri) -or
    $uri.Scheme -notin @('postgres', 'postgresql')) {
    throw 'Database URL khong hop le, can dang postgresql://user:password@host[:port]/dbname.'
  }
  $separator = $uri.UserInfo.IndexOf(':')
  $database = [Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart('/'))
  if ($separator -lt 1 -or $separator -eq $uri.UserInfo.Length - 1 -or -not $database) {
    throw 'Database URL thieu user, password hoac ten CSDL.'
  }
  $hostName = $uri.DnsSafeHost
  # localhost trong container la chinh container: doi sang may that de thu voi CSDL local.
  if ($hostName -in @('localhost', '127.0.0.1', '::1')) { $hostName = 'host.docker.internal' }
  $pgEnv = [ordered]@{
    PGHOST            = $hostName
    PGPORT            = if ($uri.Port -gt 0) { [string]$uri.Port } else { '5432' }
    PGUSER            = [Uri]::UnescapeDataString($uri.UserInfo.Substring(0, $separator))
    PGPASSWORD        = [Uri]::UnescapeDataString($uri.UserInfo.Substring($separator + 1))
    PGDATABASE        = $database
    PGCONNECT_TIMEOUT = '20'
  }
  foreach ($pair in $uri.Query.TrimStart('?').Split('&', [StringSplitOptions]::RemoveEmptyEntries)) {
    $name, $value = $pair.Split('=', 2)
    $value = [Uri]::UnescapeDataString([string]$value)
    switch ($name) {
      'schema' { } # tham so rieng cua Prisma (.env.example), libpq khong nhan
      'sslmode' { $pgEnv.PGSSLMODE = $value }
      'sslrootcert' { $pgEnv.PGSSLROOTCERT = $value } # vd 'system' de dung sslmode=verify-full
      'channel_binding' { $pgEnv.PGCHANNELBINDING = $value }
      'connect_timeout' { $pgEnv.PGCONNECT_TIMEOUT = $value }
      default { throw "Database URL co tham so '$name' chua ho tro; bo tham so do roi chay lai." }
    }
  }
  # Render bat buoc TLS cho ket noi ngoai; 'require' ma hoa duong truyen nhung khong kiem chung chi.
  if ($hostName -ne 'host.docker.internal' -and -not $pgEnv.Contains('PGSSLMODE')) {
    $pgEnv.PGSSLMODE = 'require'
  }
  $pgEnv
}

function Get-PgTargetInfo {
  # Phan khong bi mat cua URL, de script in ra cho nguoi chay biet dang tro vao dau.
  param([string]$DatabaseUrl)
  $pgEnv = ConvertTo-PgEnv $DatabaseUrl
  [pscustomobject]@{
    Host     = $pgEnv.PGHOST
    Port     = $pgEnv.PGPORT
    Database = $pgEnv.PGDATABASE
    User     = $pgEnv.PGUSER
    SslMode  = if ($pgEnv.Contains('PGSSLMODE')) { $pgEnv.PGSSLMODE } else { 'mac dinh libpq' }
  }
}

function Assert-PgImage {
  & docker image inspect $script:Image *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "Khong thay image $script:Image hoac Docker chua chay. Script khong tu tai image: mo Docker Desktop, kiem 'docker images postgres'."
  }
}

function Invoke-PgContainer {
  # Chay mot lenh trong container dung xong xoa (--rm) va khong bao gio tu tai image (--pull never).
  # Bien PG* chi dat vao env cua tien trinh pwsh quanh lenh docker roi tra gia tri cu trong finally;
  # docker nhan '-e TEN' khong kem gia tri nen gia tri khong nam trong dong lenh nao. Chi truyen bien vua
  # dat, de PGPORT/PGPASSWORD con sot trong phien (du an khac) khong lot vao container.
  # Con ho: (1) env cua tien trinh pwsh va docker trong luc chay, tien trinh cung user doc duoc;
  # (2) cau hinh container giu env, 'docker inspect' doc duoc cho toi khi --rm xoa container;
  # (3) /proc/<pid>/environ cua lenh trong may ao Docker; (4) chuoi URL trong bo nho pwsh toi khi
  # script ket thuc; (5) may bat PowerShell module logging (event 4103, mac dinh tat) thi gia tri tham
  # so -DatabaseUrl bi ghi vao Event Log. Ten CSDL (khong bi mat) van nam trong --dbname cua pg_restore.
  param(
    [System.Collections.IDictionary]$PgEnv,
    [string]$MountDir,
    [switch]$ReadOnly,
    [string[]]$Command
  )
  $dockerArgs = @('run', '--rm', '--pull', 'never')
  if ($MountDir) {
    $mount = "type=bind,source=$MountDir,target=/backup"
    if ($ReadOnly) { $mount += ',readonly' }
    $dockerArgs += @('--mount', $mount)
  }
  $saved = @{}
  try {
    if ($PgEnv) {
      foreach ($name in $PgEnv.Keys) {
        $saved[$name] = [Environment]::GetEnvironmentVariable($name)
        [Environment]::SetEnvironmentVariable($name, [string]$PgEnv[$name])
        $dockerArgs += @('-e', $name)
      }
    }
    $raw = & docker @dockerArgs $script:Image @Command 2>&1
    $exitCode = $LASTEXITCODE
  } finally {
    # Khong goi SetEnvironmentVariable($name, $null): PowerShell doi $null thanh chuoi rong va .NET 10
    # giu bien rong lai trong phien. Bien truoc do chua co thi xoa han.
    foreach ($name in $saved.Keys) {
      if ($null -eq $saved[$name]) { Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue }
      else { [Environment]::SetEnvironmentVariable($name, $saved[$name]) }
    }
  }
  # 2>&1 tron hai luong; dong stderr cua lenh ngoai la ErrorRecord, dong stdout la chuoi.
  [pscustomobject]@{
    ExitCode = $exitCode
    StdOut   = @($raw | Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] } | ForEach-Object { "$_" })
    StdErr   = @($raw | Where-Object { $_ -is [System.Management.Automation.ErrorRecord] } | ForEach-Object { "$_" })
  }
}

function Invoke-PgQuery {
  param([System.Collections.IDictionary]$PgEnv, [string]$Sql)
  $r = Invoke-PgContainer -PgEnv $PgEnv -Command @(
    'psql', '-X', '-w', '-q', '-A', '-t', '-F', '|', '-v', 'ON_ERROR_STOP=1', '-c', $Sql)
  if ($r.ExitCode -ne 0) { throw "psql that bai (ma $($r.ExitCode)): $($r.StdErr -join ' ')" }
  @($r.StdOut | Where-Object { $_ -ne '' })
}

function Get-PgRowCountCore {
  param([System.Collections.IDictionary]$PgEnv)
  # Bang chua co tra rong thay vi loi, de dem duoc ca tren DB trong hoac schema cu.
  $names = ($script:KeyTables | ForEach-Object { "'$_'" }) -join ','
  $sql = @"
SELECT t.name, CASE WHEN to_regclass(format('public.%I', t.name)) IS NULL THEN ''
  ELSE (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM public.%I', t.name),
    false, true, '')))[1]::text END
FROM unnest(ARRAY[$names]::text[]) WITH ORDINALITY AS t(name, ord) ORDER BY t.ord
"@
  $counts = [ordered]@{}
  foreach ($line in Invoke-PgQuery $PgEnv $sql) {
    $name, $value = $line.Split('|', 2)
    $counts[$name] = if ($value) { [long]$value } else { $null }
  }
  $counts
}

function Format-RowCount {
  param([System.Collections.IDictionary]$Counts)
  ($Counts.Keys | ForEach-Object {
      if ($null -eq $Counts[$_]) { "$_=(khong co bang)" } else { "$_=$($Counts[$_])" }
    }) -join ', '
}

function Get-PgRowCount {
  # So dong products, product_variants, users, orders (bang chua co thi gia tri $null).
  param([string]$DatabaseUrl)
  Get-PgRowCountCore (ConvertTo-PgEnv $DatabaseUrl)
}

function Get-MainRepoRoot {
  # Worktree cua git nam trong kho chinh: lay goc kho chinh tu --git-common-dir, khong co git thi lay
  # goc ban dang chay.
  if (Get-Command git -ErrorAction SilentlyContinue) {
    $common = & git -C $PSScriptRoot rev-parse --path-format=absolute --git-common-dir 2>$null
    if ($LASTEXITCODE -eq 0 -and $common) { return Split-Path ([IO.Path]::GetFullPath($common.Trim())) -Parent }
  }
  (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
}

function Get-DefaultBackupDir {
  # Thu muc work/ canh kho chinh, cung cho voi ../work/ o staging.md muc 4.
  Join-Path (Split-Path (Get-MainRepoRoot) -Parent) 'work' 'backups' 'staging-db'
}

function Resolve-BackupDir {
  param([string]$OutDir)
  if (-not $OutDir) { $OutDir = Get-DefaultBackupDir }
  $full = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutDir)
  $sep = [IO.Path]::DirectorySeparatorChar
  $candidate = ([IO.Path]::GetFullPath($full)).TrimEnd('\', '/') + $sep
  foreach ($root in @((Resolve-Path (Join-Path $PSScriptRoot '../..')).Path, (Get-MainRepoRoot))) {
    $prefix = ([IO.Path]::GetFullPath($root)).TrimEnd('\', '/') + $sep
    if ($candidate.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Thu muc '$full' nam trong kho ma. File dump chua du lieu nguoi dung, khong de trong kho: chon -OutDir ngoai kho."
    }
  }
  New-Item -ItemType Directory -Force -Path $full | Out-Null
  [IO.Path]::GetFullPath($full)
}

function Get-PgDumpSummary {
  # Doc lai muc luc file bang pg_restore -l (khong ket noi CSDL nao): doc duoc moi coi la ban sao luu.
  param([string]$DumpFile)
  $file = Get-Item -LiteralPath $DumpFile
  $r = Invoke-PgContainer -MountDir $file.DirectoryName -ReadOnly -Command @(
    'pg_restore', '--list', "/backup/$($file.Name)")
  if ($r.ExitCode -ne 0) {
    throw "pg_restore --list khong doc duoc $($file.Name) (ma $($r.ExitCode)): $($r.StdErr -join ' ')"
  }
  $header = @{}
  foreach ($line in $r.StdOut) {
    if ($line -match '^;\s+(TOC Entries|Dumped from database version|Dumped by pg_dump version):\s*(.+)$') {
      $header[$Matches[1]] = $Matches[2].Trim()
    }
  }
  # Dong muc luc: "<id>; <tableoid> <oid> <loai> <schema> <ten> <chu so huu>".
  $entries = @($r.StdOut | Where-Object { $_ -match '^\d+;\s' })
  if (-not $header.Contains('TOC Entries') -or $entries.Count -eq 0) {
    throw "File $($file.Name) khong co muc luc hop le, khong dung lam ban sao luu."
  }
  [pscustomobject]@{
    File          = $file.FullName
    SizeMB        = [math]::Round($file.Length / 1MB, 2)
    SizeBytes     = $file.Length
    Sha256        = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
    TocEntries    = [int]$header['TOC Entries']
    ListedEntries = $entries.Count
    Tables        = @($entries | Where-Object { $_ -match '^\d+;\s+\d+\s+\d+\s+TABLE\s+(?!DATA\s)' }).Count
    TableData     = @($entries | Where-Object { $_ -match '^\d+;\s+\d+\s+\d+\s+TABLE DATA\s' }).Count
    DumpedFrom    = $header['Dumped from database version']
    PgDump        = $header['Dumped by pg_dump version']
  }
}

function Backup-PgDatabase {
  # pg_dump -Fc ghi thang vao thu muc dich qua bind mount (khong di qua pipe PowerShell), ten .partial
  # cho toi khi pg_restore --list doc lai duoc; that bai thi xoa .partial.
  param(
    [string]$DatabaseUrl,
    [string]$OutDir,
    [ValidatePattern('^[A-Za-z0-9_.-]+$')][string]$Label = 'staging-db'
  )
  $pgEnv = ConvertTo-PgEnv $DatabaseUrl
  $dir = Resolve-BackupDir $OutDir
  Assert-PgImage
  $name = '{0}-{1:yyyyMMdd-HHmmss}.dump' -f $Label, (Get-Date)
  $partialPath = Join-Path $dir "$name.partial"
  $finalPath = Join-Path $dir $name
  if (Test-Path -LiteralPath $finalPath) { throw "Da co $finalPath, chay lai sau mot giay." }
  $verified = $false
  try {
    $r = Invoke-PgContainer -PgEnv $pgEnv -MountDir $dir -Command @(
      'pg_dump', '--format=custom', '--no-password', "--file=/backup/$name.partial")
    if ($r.ExitCode -ne 0) { throw "pg_dump that bai (ma $($r.ExitCode)):`n$($r.StdErr -join "`n")" }
    $summary = Get-PgDumpSummary -DumpFile $partialPath
    Move-Item -LiteralPath $partialPath -Destination $finalPath
    $verified = $true
  } finally {
    if (-not $verified) { Remove-Item -LiteralPath $partialPath -Force -ErrorAction SilentlyContinue }
  }
  $summary.File = $finalPath
  # Dem ngay sau khi dump de so voi luc khoi phuc; neu nguon co ghi moi giua hai lenh thi so co the lech.
  $sourceRows = try { Format-RowCount (Get-PgRowCountCore $pgEnv) } catch { "khong dem duoc: $($_.Exception.Message)" }
  $summary | Add-Member -NotePropertyName SourceRows -NotePropertyValue $sourceRows
  $summary
}

function Restore-PgDatabase {
  # Khoi phuc trong MOT transaction (--single-transaction, --exit-on-error): loi o dau thi rollback ca
  # luot, DB dich giu nguyen. --no-owner/--no-acl: user o DB dich tro thanh chu moi doi tuong, khong can
  # role cua nguon. Mac dinh tu choi DB dich da co bang; -Force them --clean --if-exists.
  param(
    [string]$DatabaseUrl,
    [string]$DumpFile,
    [switch]$Force
  )
  $pgEnv = ConvertTo-PgEnv $DatabaseUrl
  if (-not $DumpFile -or -not (Test-Path -LiteralPath $DumpFile -PathType Leaf)) {
    throw "Khong thay file dump '$DumpFile'."
  }
  Assert-PgImage
  $file = Get-Item -LiteralPath $DumpFile
  $null = Get-PgDumpSummary -DumpFile $file.FullName # file hong thi dung truoc khi cham DB dich

  $schemas = ($script:AppSchemas | ForEach-Object { "'$_'" }) -join ','
  $stateSql = @"
SELECT current_setting('server_version_num'), current_setting('server_version'), count(*)
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ($schemas) AND c.relkind IN ('r', 'p')
"@
  # @() vi PowerShell trai mang mot phan tu thanh chuoi, [0] se lay ky tu dau.
  $state = @(Invoke-PgQuery $pgEnv $stateSql)[0].Split('|')
  $versionNum, $version, $appTables = [int]$state[0], $state[1], [int]$state[2]
  # Tai lieu PostgreSQL khong dam bao dump nap duoc vao ban chinh cu hon pg_dump: chi nhan dich tu 17.
  if ($versionNum -lt 170000) {
    throw "DB dich chay PostgreSQL $version; file dump tao bang pg_dump 17, chon DB dich PostgreSQL 17 tro len."
  }
  if ($appTables -gt 0 -and -not $Force) {
    throw "DB dich da co $appTables bang trong schema $($script:AppSchemas -join '/'), dung lai de khong ghi de. Khoi phuc vao DB trong, hoac chay lai voi -Force de xoa va tao lai cac doi tuong co trong file dump."
  }
  $restoreArgs = @('pg_restore', '--no-owner', '--no-acl', '--single-transaction', '--exit-on-error',
    '--no-password', "--dbname=$($pgEnv.PGDATABASE)")
  if ($appTables -gt 0) { $restoreArgs += @('--clean', '--if-exists') }
  $restoreArgs += "/backup/$($file.Name)"
  $r = Invoke-PgContainer -PgEnv $pgEnv -MountDir $file.DirectoryName -ReadOnly -Command $restoreArgs
  if ($r.ExitCode -ne 0) {
    throw "pg_restore that bai (ma $($r.ExitCode)); ca luot nam trong mot transaction nen da rollback, DB dich giu nguyen:`n$($r.StdErr -join "`n")"
  }
  [pscustomobject]@{
    Database   = $pgEnv.PGDATABASE
    Host       = $pgEnv.PGHOST
    Server     = $version
    Mode       = if ($appTables -gt 0) { "-Force: --clean --if-exists ($appTables bang cu)" } else { 'DB trong' }
    Messages   = $r.StdErr
    TargetRows = Format-RowCount (Get-PgRowCountCore $pgEnv)
  }
}

Export-ModuleMember -Function Backup-PgDatabase, Restore-PgDatabase, Get-PgDumpSummary, Get-PgRowCount,
Get-PgTargetInfo, Get-DefaultBackupDir
