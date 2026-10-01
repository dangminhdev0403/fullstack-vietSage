<#
.SYNOPSIS
Captures a named foreground window for a finite QA session.
.EXAMPLE
.\scripts\capture-qa-window.ps1 -WindowTitle "VietSage - Google Chrome" -Count 5 -IntervalSeconds 30
.EXAMPLE
.\scripts\capture-qa-window.ps1 -SessionId "20261001T120000Z-12345678" -Upload -QaUrl "https://qa.example.com/checkpoints"
#>
[CmdletBinding()]
param(
  [string]$WindowTitle,
  [ValidateRange(1, 10000)][int]$Count = 10,
  [ValidateRange(1, 86400)][int]$IntervalSeconds = 30,
  [ValidateRange(0, 60)][int]$StartDelaySeconds = 5,
  [ValidatePattern('^[A-Za-z0-9_-]{1,64}$')][string]$SessionId,
  [string]$OutputRoot = (Join-Path $env:LOCALAPPDATA 'VietSage\qa-harness'),
  [switch]$Upload,
  [uri]$QaUrl,
  [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'

function Save-Manifest([string]$Path, [object]$Value) {
  $temporary = "$Path.tmp"
  [IO.File]::WriteAllText(
    $temporary,
    ($Value | ConvertTo-Json -Depth 8),
    [Text.UTF8Encoding]::new($false)
  )
  [IO.File]::Move($temporary, $Path, $true)
}

if ($SelfTest) {
  $testDirectory = Join-Path ([IO.Path]::GetTempPath()) ("vietsage-qa-" + [guid]::NewGuid().ToString('N'))
  [IO.Directory]::CreateDirectory($testDirectory) | Out-Null
  $testManifest = Join-Path $testDirectory 'manifest.json'
  $testArchive = Join-Path $testDirectory 'check.zip'
  try {
    Save-Manifest $testManifest @{ sessionId = 'test'; checkpoints = @(@{ number = 1 }) }
    Save-Manifest $testManifest @{ sessionId = 'test'; checkpoints = @(@{ number = 1 }, @{ number = 2 }) }
    $saved = Get-Content -LiteralPath $testManifest -Raw | ConvertFrom-Json
    if ($saved.sessionId -ne 'test' -or $saved.checkpoints.Count -ne 2) {
      throw 'Manifest round-trip failed.'
    }
    Compress-Archive -LiteralPath $testManifest -DestinationPath $testArchive
    $archive = [IO.Compression.ZipFile]::OpenRead($testArchive)
    try {
      if ($archive.Entries.Count -ne 1 -or $archive.Entries[0].Name -ne 'manifest.json') {
        throw 'ZIP verification failed.'
      }
    } finally {
      $archive.Dispose()
    }
    Write-Output 'PASS: manifest recovery and ZIP verification'
  } finally {
    [IO.File]::Delete("$testManifest.tmp")
    [IO.File]::Delete($testManifest)
    [IO.File]::Delete($testArchive)
    [IO.Directory]::Delete($testDirectory)
  }
  return
}

if (-not $IsWindows) { throw 'Window capture requires Windows.' }
if ($Upload) {
  if (-not $QaUrl -or $QaUrl.Scheme -ne 'https' -or $QaUrl.UserInfo -or $QaUrl.Fragment) {
    throw 'Upload requires an HTTPS QA URL without credentials or fragments.'
  }
  if ([string]::IsNullOrWhiteSpace($env:VIETSAGE_QA_TOKEN)) {
    throw 'Set VIETSAGE_QA_TOKEN in the process environment before upload.'
  }
}

Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class RecoveryWindow {
  [StructLayout(LayoutKind.Sequential)]
  public struct Rect { public int Left, Top, Right, Bottom; }

  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr window, StringBuilder text, int length);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out Rect rect);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
'@

function Get-ForegroundWindow {
  $handle = [RecoveryWindow]::GetForegroundWindow()
  if ($handle -eq [IntPtr]::Zero -or [RecoveryWindow]::IsIconic($handle)) {
    throw 'No visible foreground window is available.'
  }
  $name = [Text.StringBuilder]::new(512)
  [void][RecoveryWindow]::GetWindowText($handle, $name, $name.Capacity)
  $rect = [RecoveryWindow+Rect]::new()
  if (-not [RecoveryWindow]::GetWindowRect($handle, [ref]$rect)) {
    throw 'Could not read the foreground window bounds.'
  }
  [uint32]$processId = 0
  [void][RecoveryWindow]::GetWindowThreadProcessId($handle, [ref]$processId)
  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  if ($width -lt 1 -or $height -lt 1 -or $width -gt 16384 -or $height -gt 16384) {
    throw 'Foreground window bounds are invalid.'
  }
  return [pscustomobject]@{
    Handle = $handle
    Title = $name.ToString()
    ProcessId = $processId
    X = $rect.Left
    Y = $rect.Top
    Width = $width
    Height = $height
  }
}

if (-not $SessionId) {
  $SessionId = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
}
$root = [IO.Path]::GetFullPath($OutputRoot)
[IO.Directory]::CreateDirectory($root) | Out-Null
$sessionDirectory = Join-Path $root $SessionId
$manifestPath = Join-Path $sessionDirectory 'manifest.json'
$archivePath = Join-Path $root "$SessionId.zip"
$partialArchivePath = Join-Path $root "$SessionId.partial.zip"
$lockPath = Join-Path $root "$SessionId.lock"
$resuming = [IO.Directory]::Exists($sessionDirectory)
if ($resuming -and -not [IO.File]::Exists($manifestPath)) {
  throw "Existing session has no manifest: $sessionDirectory"
}
if (-not $resuming) {
  if ([IO.File]::Exists($archivePath)) {
    throw "Archive already exists for a new session: $archivePath"
  }
  if ([string]::IsNullOrWhiteSpace($WindowTitle)) {
    throw 'WindowTitle is required for a new session.'
  }
  [IO.Directory]::CreateDirectory($sessionDirectory) | Out-Null
}

$lock = [IO.File]::Open($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
try {
  if ($resuming) {
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    if ($manifest.sessionId -cne $SessionId -or
        ($WindowTitle -and $manifest.windowTitle -cne $WindowTitle) -or
        $manifest.targetCount -lt 1 -or $manifest.targetCount -gt 10000 -or
        $manifest.intervalSeconds -lt 1 -or $manifest.intervalSeconds -gt 86400 -or
        $manifest.status -notin @('recording', 'completed') -or
        $manifest.checkpoints.Count -gt $manifest.targetCount) {
      throw 'Session manifest does not match the requested capture.'
    }
    if ($manifest.status -ne 'completed' -and [IO.File]::Exists($archivePath)) {
      throw "Incomplete session has an existing archive: $archivePath"
    }
    for ($index = 0; $index -lt $manifest.checkpoints.Count; $index++) {
      $checkpoint = $manifest.checkpoints[$index]
      $expectedName = 'checkpoint-{0:D5}.png' -f ($index + 1)
      $expectedPath = Join-Path $sessionDirectory $expectedName
      if ($checkpoint.number -ne ($index + 1) -or $checkpoint.file -cne $expectedName -or
          -not [IO.File]::Exists($expectedPath) -or
          (Get-Item -LiteralPath $expectedPath).Length -ne $checkpoint.bytes -or
          (Get-FileHash -LiteralPath $expectedPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $checkpoint.sha256) {
        throw "Checkpoint integrity failed: $expectedName"
      }
    }
    $WindowTitle = $manifest.windowTitle
    $Count = [int]$manifest.targetCount
    $IntervalSeconds = [int]$manifest.intervalSeconds
  } else {
    $manifest = [ordered]@{
      sessionId = $SessionId
      windowTitle = $WindowTitle
      createdAtUtc = [DateTime]::UtcNow.ToString('o')
      intervalSeconds = $IntervalSeconds
      targetCount = $Count
      status = 'recording'
      checkpoints = @()
    }
    Save-Manifest $manifestPath $manifest
  }
  [IO.File]::Delete("$manifestPath.tmp")

  if ($manifest.status -ne 'completed') {
    [void][RecoveryWindow]::SetProcessDPIAware()
    if ($StartDelaySeconds -gt 0) { Start-Sleep -Seconds $StartDelaySeconds }
    $initial = Get-ForegroundWindow
    if ($initial.Title -cne $WindowTitle) {
      throw "Foreground window title differs from the session target: $($initial.Title)"
    }

    # ponytail: exact title and handle pin one window; add a title policy only for dynamic titles.
    for ($number = $manifest.checkpoints.Count + 1; $number -le $Count; $number++) {
      $window = Get-ForegroundWindow
      if ($window.Handle -ne $initial.Handle -or $window.Title -cne $WindowTitle) {
        throw "Foreground window changed. Resume session $SessionId after restoring focus."
      }
      $imageName = 'checkpoint-{0:D5}.png' -f $number
      $imagePath = Join-Path $sessionDirectory $imageName
      $temporaryImage = "$imagePath.tmp"
      [IO.File]::Delete($temporaryImage)
      [IO.File]::Delete($imagePath)
      $bitmap = [Drawing.Bitmap]::new($window.Width, $window.Height)
      $graphics = [Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.CopyFromScreen($window.X, $window.Y, 0, 0, $bitmap.Size)
        $bitmap.Save($temporaryImage, [Drawing.Imaging.ImageFormat]::Png)
      } finally {
        $graphics.Dispose()
        $bitmap.Dispose()
      }
      [IO.File]::Move($temporaryImage, $imagePath)
      $checkpoint = [ordered]@{
        number = $number
        file = $imageName
        capturedAtUtc = [DateTime]::UtcNow.ToString('o')
        title = $window.Title
        processId = $window.ProcessId
        x = $window.X
        y = $window.Y
        width = $window.Width
        height = $window.Height
        bytes = (Get-Item -LiteralPath $imagePath).Length
        sha256 = (Get-FileHash -LiteralPath $imagePath -Algorithm SHA256).Hash.ToLowerInvariant()
      }
      $manifest.checkpoints += $checkpoint
      Save-Manifest $manifestPath $manifest
      if ($number -lt $Count) { Start-Sleep -Seconds $IntervalSeconds }
    }
    $manifest.status = 'completed'
    $manifest.completedAtUtc = [DateTime]::UtcNow.ToString('o')
    Save-Manifest $manifestPath $manifest
  }

  if (-not [IO.File]::Exists($archivePath)) {
    [IO.File]::Delete($partialArchivePath)
    Compress-Archive -LiteralPath $sessionDirectory -DestinationPath $partialArchivePath
    [IO.File]::Move($partialArchivePath, $archivePath)
  }
  $uploaded = $false
  if ($Upload) {
    $response = Invoke-WebRequest -Uri $QaUrl -Method Post -MaximumRedirection 0 `
      -Headers @{ Authorization = "Bearer $env:VIETSAGE_QA_TOKEN" } `
      -Form @{ file = (Get-Item -LiteralPath $archivePath); sessionId = $SessionId } `
      -TimeoutSec 120
    if ([int]$response.StatusCode -lt 200 -or [int]$response.StatusCode -ge 300) {
      throw "QA service rejected the archive: HTTP $([int]$response.StatusCode)"
    }
    $uploaded = $true
  }
  [pscustomobject]@{
    SessionId = $SessionId
    Checkpoints = $manifest.checkpoints.Count
    Archive = $archivePath
    Uploaded = $uploaded
  }
} finally {
  if ($temporaryImage) { [IO.File]::Delete($temporaryImage) }
  [IO.File]::Delete($partialArchivePath)
  $lock.Dispose()
  [IO.File]::Delete($lockPath)
}
