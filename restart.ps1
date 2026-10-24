# Relaunch DeepSeek Harness once the current instance is gone.
#
# Invoked detached by the dsh-restart-button Host half. The Host answers the UI,
# then this helper stops the Electron shell. The Host observes its IPC channel
# closing and shuts itself down through its normal graceful path, so session
# logs are flushed before the application is started again.
#
# Restart doubles as "apply a downloaded update": DSH updates through
# electron-updater, and a killed Electron shell bypasses its quitAndInstall
# hook, so a downloaded update would otherwise stay pending forever. Before
# relaunching, this helper inspects the updater cache; when it holds an
# installer newer than the running application, that installer is run silently
# instead of plain relaunching.
#
# Every attempt overwrites launch.log beside this script, which records the
# decisions taken; a run that stops early names the reason there.
param(
  [Parameter(Mandatory = $true)][string]$AppExe,
  [Parameter(Mandatory = $true)][int]$MainPid,
  [Parameter(Mandatory = $true)][int]$HostPid,
  [int]$DelayMs = 900,
  [int]$HostExitMs = 20000,
  [switch]$DryRun,
  # Test hooks: force one installer path or one "running" version.
  [string]$InstallerOverride,
  [string]$AppVersionOverride
)

$ErrorActionPreference = 'Continue'
$scriptDir = $PSScriptRoot
if ([string]::IsNullOrEmpty($scriptDir)) { $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
if ([string]::IsNullOrEmpty($scriptDir)) { $scriptDir = (Get-Location).Path }
$logPath = Join-Path $scriptDir 'launch.log'
$logLines = New-Object System.Collections.Generic.List[string]

function Write-Log {
  param([string]$Message)
  $logLines.Add(('{0} {1}' -f (Get-Date -Format 'HH:mm:ss.fff'), $Message))
}

function Save-Log {
  try { Set-Content -Path $logPath -Value $logLines -Encoding utf8 } catch { }
}

function Test-Alive {
  param([int]$Target)
  return $null -ne (Get-Process -Id $Target -ErrorAction SilentlyContinue)
}

function Wait-Exit {
  param([int]$Target, [int]$TimeoutMs)
  $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
  while ([DateTime]::UtcNow -lt $deadline) {
    if (-not (Test-Alive -Target $Target)) { return $true }
    Start-Sleep -Milliseconds 100
  }
  return -not (Test-Alive -Target $Target)
}

# --- update detection -------------------------------------------------------

function Get-AutoUpdateDir {
  $known = @(
    (Join-Path $env:LOCALAPPDATA '@deepseek-aidsh-desktop-updater'),
    (Join-Path $env:LOCALAPPDATA 'deepseek-harness-updater')
  )
  foreach ($dir in $known) {
    if (Test-Path -LiteralPath (Join-Path $dir 'installer.exe')) { return $dir }
  }
  try {
    $found = Get-ChildItem -LiteralPath $env:LOCALAPPDATA -Directory -Filter '*-updater' -ErrorAction Stop |
      Where-Object { $_.Name -like '*deepseek*' } | Select-Object -First 1
    if ($null -ne $found) { return $found.FullName }
  } catch { }
  return $null
}

function Read-AsarVersion {
  param([string]$AsarPath)
  try {
    $fs = [IO.File]::OpenRead($AsarPath)
    try {
      $hdr = New-Object byte[] 16
      [void]$fs.Read($hdr, 0, 16)
      $pickle = [BitConverter]::ToUInt32($hdr, 4)
      $jsonLen = [int][BitConverter]::ToUInt32($hdr, 8) - 4
      $contentBase = 8 + [int64]$pickle
      [void]$fs.Seek(16, 'Begin')
      $json = New-Object byte[] $jsonLen
      $read = 0
      while ($read -lt $jsonLen) {
        $n = $fs.Read($json, $read, $jsonLen - $read)
        if ($n -le 0) { break }
        $read += $n
      }
      $header = ([Text.Encoding]::UTF8.GetString($json)) | ConvertFrom-Json
      $node = $header.files.dsh.files.'package.json'
      if ($null -eq $node) { return $null }
      [void]$fs.Seek($contentBase + [int64]$node.offset, 'Begin')
      $buf = New-Object byte[] ([int]$node.size)
      [void]$fs.Read($buf, 0, $buf.Length)
      $match = [regex]::Match([Text.Encoding]::UTF8.GetString($buf), '"version"\s*:\s*"([^"]+)"')
      if ($match.Success) { return $match.Groups[1].Value }
      return $null
    } finally { $fs.Dispose() }
  } catch {
    return $null
  }
}

function Get-ExeVersion {
  param([string]$ExePath)
  try {
    if (-not (Test-Path -LiteralPath $ExePath)) { return $null }
    $info = (Get-Item -LiteralPath $ExePath).VersionInfo
    if ($null -ne $info -and -not [string]::IsNullOrEmpty($info.ProductVersion)) { return $info.ProductVersion.Trim() }
    if ($null -ne $info -and -not [string]::IsNullOrEmpty($info.FileVersion)) { return $info.FileVersion.Trim() }
    return $null
  } catch { return $null }
}

function Compare-PreRelease {
  param([string]$Left, [string]$Right)
  if ($Left -eq $Right) { return 0 }
  if ([string]::IsNullOrEmpty($Left)) { return 1 }
  if ([string]::IsNullOrEmpty($Right)) { return -1 }
  $a = $Left.Split('.')
  $b = $Right.Split('.')
  $len = [Math]::Max($a.Count, $b.Count)
  for ($i = 0; $i -lt $len; $i++) {
    $x = if ($i -lt $a.Count) { $a[$i] } else { '' }
    $y = if ($i -lt $b.Count) { $b[$i] } else { '' }
    $nx = 0
    $ny = 0
    if ([int]::TryParse($x, [ref]$nx) -and [int]::TryParse($y, [ref]$ny)) {
      if ($nx -gt $ny) { return 1 }
      if ($nx -lt $ny) { return -1 }
    } else {
      $c = [string]::CompareOrdinal($x, $y)
      if ($c -ne 0) { return $c }
    }
  }
  return 0
}

function Compare-Version {
  param([string]$Left, [string]$Right)
  if ([string]::IsNullOrEmpty($Left) -or [string]::IsNullOrEmpty($Right)) { return 0 }
  $leftParts = $Left.Trim().Split('-', 2)
  $rightParts = $Right.Trim().Split('-', 2)
  $leftNums = @($leftParts[0].Split('.') | ForEach-Object { $n = 0; if ([int]::TryParse($_, [ref]$n)) { $n } else { 0 } })
  $rightNums = @($rightParts[0].Split('.') | ForEach-Object { $n = 0; if ([int]::TryParse($_, [ref]$n)) { $n } else { 0 } })
  for ($i = 0; $i -lt 3; $i++) {
    $l = if ($i -lt $leftNums.Count) { $leftNums[$i] } else { 0 }
    $r = if ($i -lt $rightNums.Count) { $rightNums[$i] } else { 0 }
    if ($l -gt $r) { return 1 }
    if ($l -lt $r) { return -1 }
  }
  $leftPre = if ($leftParts.Count -gt 1) { $leftParts[1] } else { '' }
  $rightPre = if ($rightParts.Count -gt 1) { $rightParts[1] } else { '' }
  return Compare-PreRelease $leftPre $rightPre
}

function Resolve-Update {
  param([string]$Executable, [string]$Installer)
  $version = $AppVersionOverride
  if ([string]::IsNullOrEmpty($version)) {
    $version = Read-AsarVersion (Join-Path (Split-Path -Parent $Executable) 'resources\app.asar')
  }
  if ([string]::IsNullOrEmpty($Installer)) {
    $dir = Get-AutoUpdateDir
    if ($null -ne $dir) { $Installer = Join-Path $dir 'installer.exe' }
  }
  $installerVersion = $null
  if (-not [string]::IsNullOrEmpty($Installer) -and (Test-Path -LiteralPath $Installer)) {
    $installerVersion = Get-ExeVersion $Installer
  } else {
    $Installer = ''
  }
  $useInstaller = $false
  if (-not [string]::IsNullOrEmpty($version) -and -not [string]::IsNullOrEmpty($installerVersion)) {
    $useInstaller = (Compare-Version $installerVersion $version) -gt 0
  }
  return [pscustomobject]@{
    AppVersion = $version
    Installer = $Installer
    InstallerVersion = $installerVersion
    UseInstaller = $useInstaller
  }
}

# --- main flow --------------------------------------------------------------

Write-Log ('start dryRun={0} appExe="{1}" main={2} host={3}' -f $DryRun.IsPresent, $AppExe, $MainPid, $HostPid)
Save-Log

# Let the HTTP response from the Host reach the page first.
Start-Sleep -Milliseconds $DelayMs
Write-Log 'after initial delay'

$main = Get-Process -Id $MainPid -ErrorAction SilentlyContinue
if ($null -eq $main) {
  Write-Log 'abort: main process is not running'
  Save-Log
  exit 0
}

# Safety net: only stop a process that really is this application's executable.
$mainPath = $null
try { $mainPath = $main.Path } catch { $mainPath = $null }
Write-Log ('main.Path="{0}"' -f $mainPath)
if ([string]::IsNullOrEmpty($mainPath)) {
  Write-Log 'abort: main process path is unreadable'
  Save-Log
  exit 0
}
try {
  $resolvedMain = [System.IO.Path]::GetFullPath($mainPath)
  $resolvedExe = [System.IO.Path]::GetFullPath($AppExe)
} catch {
  Write-Log ('abort: path normalization failed: {0}' -f $_.Exception.Message)
  Save-Log
  exit 0
}
Write-Log ('resolvedMain="{0}" resolvedExe="{1}"' -f $resolvedMain, $resolvedExe)
if ($resolvedMain -ne $resolvedExe) {
  Write-Log 'abort: main process is not this executable'
  Save-Log
  exit 0
}

# A bare kill skips electron-updater's quitAndInstall hook, so a downloaded
# update would wait forever. Prefer the cached installer when it is newer.
$update = Resolve-Update -Executable $AppExe -Installer $InstallerOverride
$mode = if ($update.UseInstaller) { 'install-update' } else { 'plain-restart' }
Write-Log ('update: app={0} installerVersion={1} installer="{2}" mode={3}' -f $update.AppVersion, $update.InstallerVersion, $update.Installer, $mode)
Save-Log

if ($DryRun.IsPresent) {
  Write-Log ('dry run: checks passed, would {0}' -f $(if ($update.UseInstaller) { 'install the update' } else { 'plain restart' }))
  Save-Log
  exit 0
}

# The shell goes first: its window disappears, and the Host starts its own
# graceful shutdown because its IPC parent vanished.
Write-Log 'stopping main process'
Save-Log
Stop-Process -Id $MainPid -Force -ErrorAction SilentlyContinue

# Give that shutdown the time it needs; remove whatever is left afterwards.
$hostExited = Wait-Exit -Target $HostPid -TimeoutMs $HostExitMs
Write-Log ('host exited within grace={0}' -f $hostExited)
if (-not $hostExited) {
  Stop-Process -Id $HostPid -Force -ErrorAction SilentlyContinue
  [void](Wait-Exit -Target $HostPid -TimeoutMs 5000)
  Write-Log 'host force stopped'
}

# Handles, sockets, and the profile lock need a moment to be released.
Start-Sleep -Milliseconds 500

if ($update.UseInstaller) {
  Write-Log ('starting update installer: {0}' -f $update.Installer)
  Save-Log
  try {
    $installer = Start-Process -FilePath $update.Installer -ArgumentList '/S', '--updated' `
      -WorkingDirectory (Split-Path -Parent $update.Installer) -PassThru -ErrorAction Stop
    Write-Log ('installer pid={0}; waiting for it to finish' -f $installer.Id)
    $finished = $installer.WaitForExit(120000)
    if (-not $finished) {
      Write-Log 'installer still running after 120s; leaving it to finish'
      Save-Log
      exit 0
    }
    Write-Log ('installer exit code={0}' -f $installer.ExitCode)
    # The updater installer relaunches the app itself; keep a fallback for the
    # case where it exits without starting anything.
    Start-Sleep -Seconds 2
    if (-not (Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue)) {
      Start-Process -FilePath $AppExe -WorkingDirectory (Split-Path -Parent $AppExe) | Out-Null
      Write-Log 'installer finished without launching; application started'
    } else {
      Write-Log 'application relaunched by the installer'
    }
  } catch {
    Write-Log ('failed to run update installer: {0}' -f $_.Exception.Message)
    try {
      Start-Process -FilePath $AppExe -WorkingDirectory (Split-Path -Parent $AppExe) | Out-Null
      Write-Log 'fallback: application started after installer failure'
    } catch {
      Write-Log ('failed to start the application: {0}' -f $_.Exception.Message)
    }
  }
} else {
  try {
    Start-Process -FilePath $AppExe -WorkingDirectory (Split-Path -Parent $AppExe) | Out-Null
    Write-Log 'application started'
  } catch {
    Write-Log ('failed to start the application: {0}' -f $_.Exception.Message)
  }
}
Save-Log
