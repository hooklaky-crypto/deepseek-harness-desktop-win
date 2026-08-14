$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$buildDir = Join-Path $PSScriptRoot '..\build'
$iconPath = Join-Path $buildDir 'icon.ico'
New-Item -ItemType Directory -Force -Path $buildDir | Out-Null

$size = 256
$bitmap = New-Object System.Drawing.Bitmap($size, $size)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

$background = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 24, 24, 27))
$graphics.FillRectangle($background, 0, 0, $size, $size)

$accent = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 70, 148, 255))
$graphics.FillEllipse($accent, 28, 28, 200, 200)

$white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$font = New-Object System.Drawing.Font('Segoe UI', 110, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$format = New-Object System.Drawing.StringFormat
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
$graphics.DrawString('D', $font, $white, (New-Object System.Drawing.RectangleF(0, 0, $size, $size)), $format)

$graphics.Dispose()
$background.Dispose()
$accent.Dispose()
$white.Dispose()
$font.Dispose()
$format.Dispose()

$handle = $bitmap.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($handle)
$fileStream = [System.IO.File]::Create($iconPath)
$icon.Save($fileStream)
$fileStream.Close()
$icon.Dispose()
$bitmap.Dispose()

Write-Output "icon ready at $iconPath"
