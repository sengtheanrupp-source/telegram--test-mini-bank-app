Add-Type -AssemblyName System.Drawing
$srcPath = "C:\Users\b24\.gemini\antigravity\brain\23de7b5d-938e-4f3f-a5c8-2fdcb2e2868a\telegram_mini_app_cover_1787153285221.png"
$destPath = "d:\Thean\Bill24 Working\Test Case\BillFlow\Tool\telegram mini payment app\telegram_bot_logo_640x360.png"

$src = [System.Drawing.Image]::FromFile($srcPath)
Write-Host "Original dimensions: $($src.Width)x$($src.Height)"

$dest = New-Object System.Drawing.Bitmap(640, 360)
$g = [System.Drawing.Graphics]::FromImage($dest)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

$g.DrawImage($src, 0, 0, 640, 360)

$dest.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)

$src.Dispose()
$dest.Dispose()
$g.Dispose()

Write-Host "Saved exact 640x360 logo image to: $destPath"
