# Relaunch DeepSeek Harness once the current instance is gone.
#
# Invoked detached by the dsh-restart-button Host half. The Host answers the UI,
# then this helper stops the Electron shell. The Host observes its IPC channel
# closing and shuts itself down through its normal graceful path, so session
# logs are flushed before the application is started again.
#
# Every attempt overwrites launch.log beside this script, which records the
# decisions taken; a run that stops early names the reason there.
param(
  [Parameter(Mandatory = $true)][string]$AppExe,
  [Parameter(Mandatory = $true)][int]$MainPid,
  [Parameter(Mandatory = $true)][int]$HostPid,
  [int]$DelayMs = 900,
  [int]$HostExitMs = 20000,
  [switch]$DryRun
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

if ($DryRun.IsPresent) {
  Write-Log 'dry run: checks passed, stopping here'
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

try {
  Start-Process -FilePath $AppExe -WorkingDirectory (Split-Path -Parent $AppExe) | Out-Null
  Write-Log 'application started'
} catch {
  Write-Log ('failed to start the application: {0}' -f $_.Exception.Message)
}
Save-Log
