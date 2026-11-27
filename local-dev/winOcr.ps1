param(
  [string]$FrontPath = "",
  [string]$BackPath = ""
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapPixelFormat, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapAlphaMode, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

function Await-WinRT($WinRtTask, $ResultType) {
  $netTask = $asTaskGeneric.MakeGenericMethod($ResultType).Invoke($null, @($WinRtTask))
  try {
    return $netTask.GetAwaiter().GetResult()
  } catch {
    $inner = $_.Exception
    while ($inner.InnerException) { $inner = $inner.InnerException }
    throw $inner.Message
  }
}

function Prepare-ImageForOcr([string]$InputPath) {
  $bmp = [System.Drawing.Bitmap]::FromFile($InputPath)
  try {
    $w = $bmp.Width
    $h = $bmp.Height
    $scale = 1.0
    if ($w -lt 1200) {
      $scale = [Math]::Min(2.5, 1400.0 / [Math]::Max(1, $w))
    }
    $newW = [int][Math]::Round($w * $scale)
    $newH = [int][Math]::Round($h * $scale)

    $outPath = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), ([guid]::NewGuid().ToString() + ".png"))
    $resized = New-Object System.Drawing.Bitmap($newW, $newH)
    try {
      $g = [System.Drawing.Graphics]::FromImage($resized)
      try {
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.DrawImage($bmp, 0, 0, $newW, $newH)
      } finally {
        $g.Dispose()
      }
      $resized.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $resized.Dispose()
    }
    return $outPath
  } finally {
    $bmp.Dispose()
  }
}

function Invoke-OcrOnFile([string]$Path, $Engine) {
  if (-not $Path -or -not (Test-Path $Path)) {
    return @{ text = ""; lines = @() }
  }
  $prepared = Prepare-ImageForOcr $Path
  try {
    $fs = [System.IO.File]::OpenRead($prepared)
    try {
      $stream = [System.IO.WindowsRuntimeStreamExtensions]::AsRandomAccessStream($fs)
      try {
        $decoder = Await-WinRT ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
        $softBmp = Await-WinRT ($decoder.GetSoftwareBitmapAsync([Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8, [Windows.Graphics.Imaging.BitmapAlphaMode]::Premultiplied)) ([Windows.Graphics.Imaging.SoftwareBitmap])
        try {
          $ocrResult = Await-WinRT ($Engine.RecognizeAsync($softBmp)) ([Windows.Media.Ocr.OcrResult])
          $lineObjs = @()
          foreach ($line in $ocrResult.Lines) {
            $minX = [double]::MaxValue
            $minY = [double]::MaxValue
            $maxX = 0.0
            $maxY = 0.0
            foreach ($word in $line.Words) {
              $r = $word.BoundingRect
              if ($r.X -lt $minX) { $minX = $r.X }
              if ($r.Y -lt $minY) { $minY = $r.Y }
              if (($r.X + $r.Width) -gt $maxX) { $maxX = $r.X + $r.Width }
              if (($r.Y + $r.Height) -gt $maxY) { $maxY = $r.Y + $r.Height }
            }
            if ($minX -eq [double]::MaxValue) { $minX = 0; $minY = 0 }
            $lineObjs += @{
              text = $line.Text
              x = [Math]::Round($minX, 1)
              y = [Math]::Round($minY, 1)
              width = [Math]::Round([Math]::Max(0, $maxX - $minX), 1)
              height = [Math]::Round([Math]::Max(0, $maxY - $minY), 1)
            }
          }
          return @{
            text = $ocrResult.Text
            lines = $lineObjs
          }
        } finally {
          $softBmp.Dispose()
        }
      } finally {
        $stream.Dispose()
      }
    } finally {
      $fs.Dispose()
    }
  } finally {
    if (Test-Path $prepared) { Remove-Item $prepared -Force -ErrorAction SilentlyContinue }
  }
}

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if ($null -eq $engine) {
  $lang = New-Object Windows.Globalization.Language("en-US")
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
}
if ($null -eq $engine) {
  throw "Windows OCR engine could not be initialized."
}

$front = Invoke-OcrOnFile $FrontPath $engine
$back = Invoke-OcrOnFile $BackPath $engine

$output = @{
  frontText = $front.text
  backText = $back.text
  frontLines = $front.lines
  backLines = $back.lines
}

$output | ConvertTo-Json -Depth 5 -Compress
