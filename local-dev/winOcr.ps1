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

function Wait-WinRtTask($WinRtTask, $ResultType) {
  $netTask = $asTaskGeneric.MakeGenericMethod($ResultType).Invoke($null, @($WinRtTask))
  try {
    return $netTask.GetAwaiter().GetResult()
  } catch {
    $inner = $_.Exception
    while ($inner.InnerException) { $inner = $inner.InnerException }
    throw $inner.Message
  }
}

function Set-ExifOrientation($Bitmap) {
  $orientationId = 0x0112
  if ($Bitmap.PropertyIdList -contains $orientationId) {
    try {
      $prop = $Bitmap.GetPropertyItem($orientationId)
      $val = [BitConverter]::ToUInt16($prop.Value, 0)
      switch ($val) {
        2 { $Bitmap.RotateFlip([System.Drawing.RotateFlipType]::RotateNoneFlipX) }
        3 { $Bitmap.RotateFlip([System.Drawing.RotateFlipType]::Rotate180FlipNone) }
        4 { $Bitmap.RotateFlip([System.Drawing.RotateFlipType]::Rotate180FlipX) }
        5 { $Bitmap.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipX) }
        6 { $Bitmap.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone) }
        7 { $Bitmap.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipX) }
        8 { $Bitmap.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone) }
      }
    } catch {
      # Ignore malformed EXIF metadata
    }
  }
}

function ConvertTo-OcrImage([string]$InputPath, [bool]$InvertContrast = $false) {
  $bmp = [System.Drawing.Bitmap]::FromFile($InputPath)
  try {
    Set-ExifOrientation $bmp
    $w = $bmp.Width
    $h = $bmp.Height
    $scale = 1.0
    if ($w -lt 1300) {
      $scale = [Math]::Min(2.8, 1600.0 / [Math]::Max(1, $w))
    }
    $maxDim = [Math]::Max($w * $scale, $h * $scale)
    if ($maxDim -gt 3600) {
      $scale = 3600.0 / [Math]::Max($w, $h)
    }

    $newW = [int][Math]::Max(1, [Math]::Round($w * $scale))
    $newH = [int][Math]::Max(1, [Math]::Round($h * $scale))

    $outPath = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), ([guid]::NewGuid().ToString() + ".png"))
    $resized = New-Object System.Drawing.Bitmap($newW, $newH)
    try {
      $g = [System.Drawing.Graphics]::FromImage($resized)
      try {
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

        if ($InvertContrast) {
          # Grayscale + inverted + high-contrast matrix for dark-background visiting cards
          $matrix = New-Object System.Drawing.Imaging.ColorMatrix -ArgumentList @(
            ,@(-0.5, -0.5, -0.5, 0, 0)
            ,@(-0.9, -0.9, -0.9, 0, 0)
            ,@(-0.2, -0.2, -0.2, 0, 0)
            ,@(0,    0,    0,    1, 0)
            ,@(1.25, 1.25, 1.25, 0, 1)
          )
          $attrs = New-Object System.Drawing.Imaging.ImageAttributes
          try {
            $attrs.SetColorMatrix($matrix)
            $rect = New-Object System.Drawing.Rectangle(0, 0, $newW, $newH)
            $g.DrawImage($bmp, $rect, 0, 0, $w, $h, [System.Drawing.GraphicsUnit]::Pixel, $attrs)
          } finally {
            $attrs.Dispose()
          }
        } else {
          $g.DrawImage($bmp, 0, 0, $newW, $newH)
        }
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

function Invoke-SingleOcrPass([string]$PreparedPath, $Engine) {
  $fs = [System.IO.File]::OpenRead($PreparedPath)
  try {
    $stream = [System.IO.WindowsRuntimeStreamExtensions]::AsRandomAccessStream($fs)
    try {
      $decoder = Wait-WinRtTask ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
      $softBmp = Wait-WinRtTask ($decoder.GetSoftwareBitmapAsync([Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8, [Windows.Graphics.Imaging.BitmapAlphaMode]::Premultiplied)) ([Windows.Graphics.Imaging.SoftwareBitmap])
      try {
        $ocrResult = Wait-WinRtTask ($Engine.RecognizeAsync($softBmp)) ([Windows.Media.Ocr.OcrResult])
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
}

function Invoke-OcrOnFile([string]$Path, $Engine) {
  if (-not $Path -or -not (Test-Path $Path)) {
    return @{ text = ""; lines = @() }
  }

  $pass1Path = ConvertTo-OcrImage $Path $false
  try {
    $best = Invoke-SingleOcrPass $pass1Path $Engine
    # If few lines detected (common on dark/metallic cards), try inverted high-contrast pass
    if ($best.lines.Count -lt 4 -or $best.text.Length -lt 40) {
      $pass2Path = ConvertTo-OcrImage $Path $true
      try {
        $alt = Invoke-SingleOcrPass $pass2Path $Engine
        if ($alt.lines.Count -gt $best.lines.Count -or ($alt.lines.Count -eq $best.lines.Count -and $alt.text.Length -gt $best.text.Length)) {
          $best = $alt
        }
      } finally {
        if (Test-Path $pass2Path) { Remove-Item $pass2Path -Force -ErrorAction SilentlyContinue }
      }
    }
    return $best
  } finally {
    if (Test-Path $pass1Path) { Remove-Item $pass1Path -Force -ErrorAction SilentlyContinue }
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
