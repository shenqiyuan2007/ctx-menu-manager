param(
  [Parameter(Mandatory = $true)][string]$Action,
  [Parameter(Mandatory = $true)][string]$Path,
  [string]$Name = '',
  [string]$Data = '',
  [string]$Kind = 'String',
  [string]$File = '',
  [Parameter(Mandatory = $true)][string]$OutFile
)

$ErrorActionPreference = 'Stop'

$HIVES = @{
  'HKEY_CLASSES_ROOT'  = [Microsoft.Win32.Registry]::ClassesRoot
  'HKEY_LOCAL_MACHINE' = [Microsoft.Win32.Registry]::LocalMachine
  'HKEY_CURRENT_USER'  = [Microsoft.Win32.Registry]::CurrentUser
}

function Split-Path2([string]$p) {
  $i = $p.IndexOf('\')
  if ($i -lt 0) { return @($p, '') }
  return @($p.Substring(0, $i), $p.Substring($i + 1))
}

function Write-Result($ok, $err, $code, $payload) {
  $obj = [pscustomobject]@{ ok = $ok; error = $err; code = $code; payload = $payload }
  $json = $obj | ConvertTo-Json -Depth 8 -Compress
  [System.IO.File]::WriteAllText($OutFile, $json, (New-Object System.Text.UTF8Encoding($false)))
}

function Read-Values($key) {
  $list = @()
  foreach ($n in $key.GetValueNames()) {
    $list += [pscustomobject]@{
      name = $n
      kind = $key.GetValueKind($n).ToString()
      data = $key.GetValue($n, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
    }
  }
  return , $list
}

try {
  $parts = Split-Path2 $Path
  $hive = $HIVES[$parts[0]]
  if (-not $hive) { throw "Unknown hive: $($parts[0])" }
  $sub = $parts[1]

  switch ($Action) {
    'set' {
      $k = $hive.CreateSubKey($sub)
      $k.SetValue($Name, [string]$Data, [Microsoft.Win32.RegistryValueKind]::$Kind)
      $k.Close()
      Write-Result $true '' '' $null
    }
    'delvalue' {
      $k = $hive.OpenSubKey($sub, $true)
      if ($k) {
        $k.DeleteValue($Name, $false)
        $k.Close()
      }
      Write-Result $true '' '' $null
    }
    'deletekey' {
      $hive.DeleteSubKeyTree($sub, $false)
      Write-Result $true '' '' $null
    }
    'snapshot' {
      $k = $hive.OpenSubKey($sub, $false)
      if (-not $k) { throw "Key not found: $Path" }
      $values = Read-Values $k
      $subkeys = @()
      foreach ($s in $k.GetSubKeyNames()) {
        $sk = $k.OpenSubKey($s, $false)
        $subkeys += [pscustomobject]@{ name = $s; values = (Read-Values $sk) }
        $sk.Close()
      }
      $k.Close()
      Write-Result $true '' '' ([pscustomobject]@{ key = $Path; values = $values; subkeys = $subkeys })
    }
    'restore' {
      $snap = Get-Content -LiteralPath $File -Raw -Encoding UTF8 | ConvertFrom-Json
      $k = $hive.CreateSubKey($sub)
      foreach ($v in $snap.values) {
        $kindEnum = 'String'
        if ($v.kind) { $kindEnum = [string]$v.kind }
        $k.SetValue([string]$v.name, $v.data, [Microsoft.Win32.RegistryValueKind]::$kindEnum)
      }
      foreach ($s in $snap.subkeys) {
        $sk = $k.CreateSubKey([string]$s.name)
        foreach ($v in $s.values) {
          $kindEnum = 'String'
          if ($v.kind) { $kindEnum = [string]$v.kind }
          $sk.SetValue([string]$v.name, $v.data, [Microsoft.Win32.RegistryValueKind]::$kindEnum)
        }
        $sk.Close()
      }
      $k.Close()
      Write-Result $true '' '' $null
    }
    default { throw "Unknown action: $Action" }
  }
} catch {
  $code = 'failed'
  $msg = ''
  $e = $_.Exception
  while ($e) {
    if ($e.GetType().Name -match 'Unauthorized|Security') { $code = 'denied' }
    if ($e.Message -and $e.Message -match 'Access is denied|Access to the registry key|denied') { $code = 'denied' }
    if ($e.Message) { $msg = $e.Message }
    $e = $e.InnerException
  }
  if (-not $msg) { $msg = 'unknown error' }
  Write-Result $false $msg $code $null
}
