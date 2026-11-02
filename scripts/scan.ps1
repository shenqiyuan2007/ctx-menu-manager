param(
  [Parameter(Mandatory = $true)][string]$OutFile,
  [string]$CacheDir = "",
  [int]$CacheHours = 12
)

$ErrorActionPreference = 'SilentlyContinue'

# ---------- fast registry access (no exceptions on missing keys) ----------
$script:HIVES = @{
  'HKEY_CLASSES_ROOT'  = [Microsoft.Win32.Registry]::ClassesRoot
  'HKEY_LOCAL_MACHINE' = [Microsoft.Win32.Registry]::LocalMachine
  'HKEY_CURRENT_USER'  = [Microsoft.Win32.Registry]::CurrentUser
}

function Get-RKey([string]$path) {
  if (-not $path) { return $null }
  $idx = $path.IndexOf('\')
  if ($idx -lt 0) { return $script:HIVES[$path] }
  $hive = $script:HIVES[$path.Substring(0, $idx)]
  if (-not $hive) { return $null }
  return $hive.OpenSubKey($path.Substring($idx + 1))
}
function RegKids([string]$path) {
  $k = Get-RKey $path
  if (-not $k) { return @() }
  try { return $k.GetSubKeyNames() } catch { return @() } finally { $k.Close() }
}
function RegNames([string]$path) {
  $k = Get-RKey $path
  if (-not $k) { return @() }
  try { return $k.GetValueNames() } catch { return @() } finally { $k.Close() }
}
function RegRaw([string]$path, [string]$name) {
  $k = Get-RKey $path
  if (-not $k) { return $null }
  try {
    return $k.GetValue($name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
  } catch { return $null } finally { $k.Close() }
}
function RegDef([string]$path) { return RegRaw $path '' }
function HasVal([string]$path, [string]$name) {
  $k = Get-RKey $path
  if (-not $k) { return $false }
  try { return ($k.GetValueNames() -contains $name) } catch { return $false } finally { $k.Close() }
}

# ---------- text helpers ----------
function NormClsid([string]$s) {
  if (-not $s) { return $null }
  $m = [regex]::Match($s, '(?i)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})')
  if ($m.Success) { return ('{' + $m.Groups[1].Value.ToUpper() + '}') }
  return $null
}
function Expand([string]$p) {
  if (-not $p) { return $null }
  $p = $p.Trim().Trim('"')
  try { $p = [Environment]::ExpandEnvironmentVariables($p) } catch { }
  return $p
}
function FileDesc([string]$path) {
  if (-not $path) { return $null }
  $path = Expand $path
  if (-not $path) { return $null }
  if (-not [System.IO.File]::Exists($path)) { return $null }
  try {
    $vi = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($path)
    foreach ($cand in @($vi.FileDescription, $vi.ProductName)) {
      if (-not $cand) { continue }
      $cand = $cand.Trim()
      if (-not $cand) { continue }
      if ($cand -match '(?i)TODO|ms-resource:|^<.*>$') { continue }
      if ($cand -match '(?i)\.(dll|exe|ocx|sys|cpl)$') { continue }
      return $cand
    }
  } catch { }
  return $null
}
function PrettyVerb([string]$s) {
  if (-not $s) { return '' }
  $t = [regex]::Replace($s, '([a-z0-9])([A-Z])', '$1 $2')
  $t = [regex]::Replace($t, '([A-Za-z])([0-9])', '$1 $2')
  $t = ($t -replace '_', ' ').Trim()
  if ($t.Length -gt 0) { $t = $t.Substring(0, 1).ToUpper() + $t.Substring(1) }
  return $t
}
function ExeFromCmd([string]$cmd) {
  if (-not $cmd) { return $null }
  $cmd = $cmd.Trim()
  $m = [regex]::Match($cmd, '^"([^"]+)"')
  if ($m.Success) { return (Expand $m.Groups[1].Value) }
  $m = [regex]::Match($cmd, '^([^\s,]+\.(exe|dll|com|bat|cmd))', 'IgnoreCase')
  if ($m.Success) { return (Expand $m.Groups[1].Value) }
  return $null
}
function Pretty([string]$s) {
  if (-not $s) { return '' }
  return ($s -replace '[_\.]', ' ').Trim()
}
function IconPath([string]$icon, [string]$fallback) {
  if ($icon) {
    $p = $icon.Trim()
    if ($p -match '^"([^"]+)"') { $p = $matches[1] }
    $p = ($p -split ',')[0]
    $p = Expand $p
    if ($p -and [System.IO.File]::Exists($p)) { return $p }
  }
  if ($fallback -and [System.IO.File]::Exists($fallback)) { return $fallback }
  return $null
}

# ---------- blocked list ----------
$blocked = @{}
foreach ($root in @(
    'HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Shell Extensions\Blocked',
    'HKEY_CURRENT_USER\SOFTWARE\Microsoft\Windows\CurrentVersion\Shell Extensions\Blocked')) {
  foreach ($n in (RegNames $root)) {
    $c = NormClsid $n
    if ($c) { $blocked[$c] = $root }
  }
}

# ---------- packaged (Win11 first-level) context menus ----------
function Get-PackagedMenus {
  if ($CacheDir) {
    $f = Join-Path $CacheDir 'packaged.json'
    if (Test-Path -LiteralPath $f) {
      try {
        $cache = Get-Content -LiteralPath $f -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($cache -and $cache.ts) {
          $age = (New-TimeSpan -Start ([datetime]$cache.ts) -End (Get-Date)).TotalHours
          if ($age -lt $CacheHours -and $null -ne $cache.items) { return @($cache.items) }
        }
      } catch { }
    }
  }

  $raw = @()
  foreach ($p in (Get-AppxPackage | Where-Object { -not $_.IsFramework -and -not $_.IsResourcePackage })) {
    try {
      $man = Get-AppxPackageManifest -Package $p.PackageFullName -ErrorAction Stop
      $xmlText = $man.OuterXml
      if ($xmlText -notmatch 'FileExplorerContextMenus') { continue }
      $xml = [xml]$xmlText
      $verbs = $xml.SelectNodes("//*[local-name()='Verb']")
      if (-not $verbs -or $verbs.Count -eq 0) { continue }
      $types = @()
      foreach ($t in $xml.SelectNodes("//*[local-name()='ItemType']")) {
        if ($t.Type) { $types += $t.Type }
      }
      if ($types.Count -eq 0) { $types = @('*') }
      $typeStr = ($types -join ',')
      $inst = [string]$p.InstallLocation
      foreach ($v in $verbs) {
        $c = NormClsid $v.Clsid
        if (-not $c) { continue }
        $clsKey = "HKEY_CLASSES_ROOT\PackagedCom\Package\$($p.PackageFullName)\Class\$c"
        $dllRel = RegRaw $clsKey 'DllPath'
        $iconRel = RegDef $clsKey 'DefaultIcon'
        $classDll = $null
        $classIcon = $null
        if ($inst) {
          if ($dllRel) {
            $cand = Join-Path $inst ($dllRel -replace '/', '\')
            if ([System.IO.File]::Exists($cand)) { $classDll = $cand }
          }
          if ($iconRel) {
            $iconRel = ($iconRel -split ',')[0].Trim().Trim('"')
            if ($iconRel) {
              $cand = Join-Path $inst ($iconRel -replace '/', '\')
              if ([System.IO.File]::Exists($cand)) { $classIcon = $cand }
            }
          }
        }
        $raw += [pscustomobject]@{
          clsid    = $c
          verbId   = [string]$v.Id
          types    = $typeStr
          page     = $(if ($typeStr -match '(?i)Background') { 'desktop' } else { 'file' })
          package  = [string]$p.PackageFullName
          pkgName  = [string]$p.Name
          display  = (Pretty ($p.Name -replace '\..*$', ''))
          classDll = $classDll
          classIcon = $classIcon
        }
      }
    } catch { }
  }

  $items = @()
  $seen = @{}
  foreach ($i in $raw) {
    $key = $i.clsid + '|' + $i.page
    if ($seen.ContainsKey($key)) { continue }
    $seen[$key] = 1
    $items += $i
  }

  if ($CacheDir) {
    try {
      $payload = [pscustomobject]@{ ts = (Get-Date).ToString('o'); items = $items }
      [System.IO.File]::WriteAllText((Join-Path $CacheDir 'packaged.json'), ($payload | ConvertTo-Json -Depth 6 -Compress), (New-Object System.Text.UTF8Encoding($false)))
    } catch { }
  }
  return $items
}

$packaged = @(Get-PackagedMenus)
$packagedByClsid = @{}
foreach ($p in $packaged) { if (-not $packagedByClsid.ContainsKey($p.clsid)) { $packagedByClsid[$p.clsid] = $p } }

# ---------- collect static verbs ----------
function Get-Verbs([string]$root, [string]$page) {
  $list = @()
  foreach ($k in (RegKids "$root\shell")) {
    if (-not $k) { continue }
    if ($k -eq 'OpenWithProgids') { continue }
    $p = "$root\shell\$k"
    $def = RegDef $p
    $mui = RegRaw $p 'MUIVerb'
    $cmd = RegDef "$p\command"
    $iconVal = RegRaw $p 'Icon'
    $exe = ExeFromCmd $cmd
    $name = $null
    if ($def -and $def -notlike '@*') { $name = $def }
    elseif ($mui -and $mui -notlike '@*') { $name = $mui }
    if (-not $name) { $name = FileDesc $exe }
    if (-not $name) { $name = Pretty $k }

    $disabled = (HasVal $p 'LegacyDisable') -or (HasVal $p 'ProgrammaticAccessOnly')

    $list += [pscustomobject]@{
      id       = ('verb:' + ($p.ToLower() -replace '[\\\s]', '_'))
      page     = $page
      kind     = 'verb'
      name     = $name
      keyName  = $k
      regPath  = $p
      clsid    = $null
      command  = $cmd
      target   = $exe
      iconPath = (IconPath $iconVal $exe)
      enabled  = (-not $disabled)
      extended = (HasVal $p 'Extended')
      origin   = 'win10'
      source   = 'shell-verb'
      vendor   = (FileDesc $exe)
    }
  }
  return $list
}

# ---------- collect shellex handlers ----------
function Get-Handlers([string]$root, [string]$page) {
  $list = @()
  foreach ($k in (RegKids "$root\shellex\ContextMenuHandlers")) {
    if (-not $k) { continue }
    $p = "$root\shellex\ContextMenuHandlers\$k"
    $raw = RegDef $p
    $clsid = NormClsid $raw
    if (-not $clsid) { $clsid = NormClsid $k }
    $dll = $null
    if ($clsid) {
      $dll = RegDef "HKEY_CLASSES_ROOT\CLSID\$clsid\InprocServer32"
      if (-not $dll) { $dll = RegDef "HKEY_CLASSES_ROOT\CLSID\$clsid\LocalServer32" }
      if (-not $dll) { $dll = RegDef "HKEY_CLASSES_ROOT\PackagedCom\ClassIndex\$clsid\DllPath" }
    }
    $dll = Expand $dll
    $pkg = $null
    if ($clsid -and $packagedByClsid.ContainsKey($clsid)) { $pkg = $packagedByClsid[$clsid] }
    if (-not $dll -and $pkg -and $pkg.classDll) { $dll = $pkg.classDll }

    $name = $null
    if ($raw -and $raw -notlike '@*' -and -not (NormClsid $raw)) { $name = $raw }
    if (-not $name) { $name = FileDesc $dll }
    if (-not $name -and $pkg) { $name = $pkg.display }
    if (-not $name) { $name = Pretty $k }

    $list += [pscustomobject]@{
      id       = ('hnd:' + ($p.ToLower() -replace '[\\\s]', '_'))
      page     = $page
      kind     = 'handler'
      name     = $name
      keyName  = $k
      regPath  = $p
      clsid    = $clsid
      command  = $null
      target   = $dll
      iconPath = (IconPath $null $dll)
      enabled  = (-not ($clsid -and $blocked.ContainsKey($clsid)))
      extended = $false
      origin   = $(if ($pkg) { 'win11' } else { 'win10' })
      source   = $(if ($pkg) { 'packaged' } else { 'shellex' })
      vendor   = (FileDesc $dll)
      package  = $(if ($pkg) { $pkg.package } else { $null })
    }
  }
  return $list
}

# ---------- packaged items declared in manifest but absent from shellex ----------
function Get-PackagedOnly([hashtable]$known) {
  $list = @()
  $seen = @{}
  foreach ($p in $packaged) {
    if ($known.ContainsKey($p.clsid + '|' + $p.page)) { continue }
    if ($seen.ContainsKey($p.clsid + '|' + $p.page)) { continue }
    $seen[$p.clsid + '|' + $p.page] = 1
    $dll = $p.classDll
    if (-not $dll -and $p.classIcon) { $dll = $p.classIcon }
    if (-not $dll) {
      $dll = RegDef "HKEY_CLASSES_ROOT\CLSID\$($p.clsid)\InprocServer32"
      $dll = Expand $dll
    }
    $icon = $p.classIcon
    if (-not $icon) { $icon = $dll }
    $name = FileDesc $dll
    if (-not $name) { $name = PrettyVerb $p.verbId }
    if (-not $name) { $name = $p.display }
    $list += [pscustomobject]@{
      id       = ('pkg:' + ($p.clsid.ToLower() -replace '[{}]', '') + ':' + $p.page)
      page     = $p.page
      kind     = 'packaged'
      name     = $name
      keyName  = $p.verbId
      regPath  = "HKEY_CLASSES_ROOT\PackagedCom\ClassIndex\$($p.clsid)"
      clsid    = $p.clsid
      command  = $null
      target   = $dll
      iconPath = (IconPath $null $icon)
      enabled  = (-not $blocked.ContainsKey($p.clsid))
      extended = $false
      origin   = 'win11'
      source   = 'manifest'
      vendor   = $p.display
      package  = $p.package
    }
  }
  return $list
}

# ---------- new menu (ShellNew) ----------
function Get-NewItems {
  $list = @()
  $rootKeys = RegKids 'HKEY_CLASSES_ROOT'
  foreach ($k in $rootKeys) {
    if (-not $k.StartsWith('.')) { continue }
    $sn = "HKEY_CLASSES_ROOT\$k\ShellNew"
    $vals = RegNames $sn
    if ($vals.Count -eq 0) { continue }
    $typeName = RegDef "HKEY_CLASSES_ROOT\$k"
    $iconVal = RegDef "HKEY_CLASSES_ROOT\$k\DefaultIcon"
    $cmd = RegDef "$sn\Command"
    $fileName = RegRaw $sn 'FileName'
    $name = $null
    if ($typeName -and $typeName -notlike '@*') {
      $resolved = RegDef "HKEY_CLASSES_ROOT\$typeName"
      if ($resolved -and $resolved -notlike '@*' -and $resolved -notmatch '^[a-z]+file') { $name = $resolved }
      else { $name = $typeName }
    }
    if (-not $name) { $name = (PrettyVerb ($k.TrimStart('.') -replace '\..*$', '')) }
    $target = $null
    if ($fileName) { $target = Expand $fileName }
    if (-not $target) { $target = ExeFromCmd $cmd }
    $list += [pscustomobject]@{
      id       = ('new:' + $k.ToLower())
      page     = 'new'
      kind     = 'shellnew'
      name     = $name
      keyName  = $k
      regPath  = $sn
      clsid    = $null
      command  = $(if ($cmd) { $cmd } else { $fileName })
      target   = $target
      iconPath = (IconPath $iconVal $target)
      enabled  = $true
      extended = $false
      origin   = 'both'
      source   = 'shellnew'
      vendor   = $null
      ext      = $k
    }
  }
  return $list
}

# ---------- run ----------
$file = @()
$file += Get-Verbs 'HKEY_CLASSES_ROOT\*' 'file'
$file += Get-Handlers 'HKEY_CLASSES_ROOT\*' 'file'
$file += Get-Handlers 'HKEY_CLASSES_ROOT\AllFilesystemObjects' 'file'

$desktop = @()
$desktop += Get-Verbs 'HKEY_CLASSES_ROOT\Directory\Background' 'desktop'
$desktop += Get-Handlers 'HKEY_CLASSES_ROOT\Directory\Background' 'desktop'
$desktop += Get-Verbs 'HKEY_CLASSES_ROOT\DesktopBackground' 'desktop'
$desktop += Get-Handlers 'HKEY_CLASSES_ROOT\DesktopBackground' 'desktop'

$known = @{}
foreach ($i in ($file + $desktop)) { if ($i.clsid) { $known[$i.clsid + '|' + $i.page] = 1 } }
foreach ($i in (Get-PackagedOnly $known)) {
  if ($i.page -eq 'desktop') { $desktop += $i } else { $file += $i }
}

$newItems = Get-NewItems

function Dedupe($arr) {
  $out = @()
  $seen = @{}
  foreach ($i in $arr) {
    if ($seen.ContainsKey($i.id)) { continue }
    $seen[$i.id] = 1
    $out += $i
  }
  return $out
}

$isAdmin = $false
try {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $pr = New-Object Security.Principal.WindowsPrincipal($id)
  $isAdmin = $pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
} catch { }

$osBuild = [string](RegRaw 'HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion' 'CurrentBuildNumber')

$payload = [pscustomobject]@{
  scannedAt = (Get-Date).ToString('o')
  build     = $osBuild
  isAdmin   = $isAdmin
  pages     = [pscustomobject]@{
    file    = @(Dedupe $file)
    desktop = @(Dedupe $desktop)
    new     = @($newItems)
  }
}

$json = $payload | ConvertTo-Json -Depth 8 -Compress
[System.IO.File]::WriteAllText($OutFile, $json, (New-Object System.Text.UTF8Encoding($false)))
