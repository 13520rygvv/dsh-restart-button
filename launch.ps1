# Start restart.ps1 as an independent process.
#
# This orchestrator is spawned and awaited by the dsh-restart-button Host half,
# so it runs while the Host is still alive. It hands the actual restart to
# Windows Management Instrumentation: the created process belongs to WmiPrvSE
# and therefore keeps running after the Host exits, which a direct child does
# not reliably do. A Start-Process fallback keeps older systems working.
param(
  [Parameter(Mandatory = $true)][string]$AppExe,
  [Parameter(Mandatory = $true)][int]$MainPid,
  [Parameter(Mandatory = $true)][int]$HostPid,
  [Parameter(Mandatory = $true)][string]$PwshPath,
  [Parameter(Mandatory = $true)][string]$ScriptPath,
  [int]$DelayMs = 900,
  [int]$HostExitMs = 20000
)

$ErrorActionPreference = 'Stop'
$logPath = Join-Path (Split-Path -Parent $ScriptPath) 'orchestrator.log'

function Write-Log {
  param([string]$Message)
  try { Add-Content -Path $logPath -Value ('{0} {1}' -f (Get-Date -Format 'HH:mm:ss.fff'), $Message) } catch { }
}

function Quote {
  param([string]$Value)
  return '"' + $Value + '"'
}

$argumentList = @(
  (Quote $PwshPath),
  '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
  '-File', (Quote $ScriptPath),
  '-AppExe', (Quote $AppExe),
  '-MainPid', [string]$MainPid,
  '-HostPid', [string]$HostPid,
  '-DelayMs', [string]$DelayMs,
  '-HostExitMs', [string]$HostExitMs
)
$commandLine = $argumentList -join ' '
$workingDirectory = Split-Path -Parent $AppExe
Write-Log ('starting: ' + $commandLine)

try {
  $startup = New-CimInstance -ClassName Win32_ProcessStartup -Property @{ ShowWindow = [uint16]0 } -ClientOnly -ErrorAction Stop
  $result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine = $commandLine
    CurrentDirectory = $workingDirectory
    ProcessStartupInformation = $startup
  } -ErrorAction Stop
  if ($result.ReturnValue -ne 0) { throw ('Win32_Process.Create returned ' + $result.ReturnValue) }
  Write-Log ('created pid=' + $result.ProcessId)
  exit 0
} catch {
  Write-Log ('WMI failed: ' + $_.Exception.Message + '; falling back to Start-Process')
  try {
    $fallback = @(
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', (Quote $ScriptPath),
      '-AppExe', (Quote $AppExe),
      '-MainPid', [string]$MainPid,
      '-HostPid', [string]$HostPid,
      '-DelayMs', [string]$DelayMs,
      '-HostExitMs', [string]$HostExitMs
    )
    Start-Process -FilePath $PwshPath -ArgumentList $fallback -WindowStyle Hidden -WorkingDirectory $workingDirectory | Out-Null
    Write-Log 'fallback started'
    exit 0
  } catch {
    Write-Log ('fallback failed: ' + $_.Exception.Message)
    exit 1
  }
}
