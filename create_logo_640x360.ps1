Add-Type -AssemblyName System.Drawing

$width = 640
$height = 360
$destPath = "d:\Thean\Bill24 Working\Test Case\BillFlow\Tool\telegram mini payment app\telegram_bot_logo_640x360.png"

$bmp = New-Object System.Drawing.Bitmap($width, $height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

# 1. Solid white background
$g.Clear([System.Drawing.Color]::White)

# 2. Draw circular icon centered
$circleSize = 250
$circleX = ($width - $circleSize) / 2
$circleY = ($height - $circleSize) / 2

$gradRect = New-Object System.Drawing.RectangleF($circleX, $circleY, $circleSize, $circleSize)
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $gradRect,
    [System.Drawing.Color]::FromArgb(255, 0, 180, 255),
    [System.Drawing.Color]::FromArgb(255, 140, 40, 255),
    45.0
)

$g.FillEllipse($brush, $circleX, $circleY, $circleSize, $circleSize)

# 3. Draw credit card icon inside
# Card bounding: width=130, height=90, centered at (320, 170)
$cardW = 130
$cardH = 90
$cardX = 320 - ($cardW / 2) - 5
$cardY = 180 - ($cardH / 2) - 5

$whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$blueBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 60, 90, 240))

# Rounded rectangle function
function DrawRoundedRectangle($gfx, $brush, $x, $y, $w, $h, $r) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($x, $y, $r, $r, 180, 90)
    $path.AddArc($x + $w - $r, $y, $r, $r, 270, 90)
    $path.AddArc($x + $w - $r, $y + $h - $r, $r, $r, 0, 90)
    $path.AddArc($x, $y + $h - $r, $r, $r, 90, 90)
    $path.CloseAllFigures()
    $gfx.FillPath($brush, $path)
    $path.Dispose()
}

# Top bar of credit card
DrawRoundedRectangle $g $whiteBrush ($cardX) ($cardY) ($cardW) 22 10
# Main card body
DrawRoundedRectangle $g $whiteBrush ($cardX) ($cardY + 26) ($cardW) 64 12

# Chip icon
DrawRoundedRectangle $g $blueBrush ($cardX + 14) ($cardY + 36) 18 16 4

# Card lines
$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 60, 90, 240), 5)
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

$g.DrawLine($pen, ($cardX + 14), ($cardY + 62), ($cardX + 50), ($cardY + 62))
$g.DrawLine($pen, ($cardX + 14), ($cardY + 74), ($cardX + 38), ($cardY + 74))

# Checkmark Circle Badge (bottom-right of card)
$badgeSize = 56
$badgeX = $cardX + $cardW - 40
$badgeY = $cardY + $cardH - 36

$g.FillEllipse($whiteBrush, $badgeX, $badgeY, $badgeSize, $badgeSize)

# Checkmark path inside badge
$checkPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 60, 90, 240), 6)
$checkPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$checkPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$checkPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

$p1 = New-Object System.Drawing.PointF(($badgeX + 16), ($badgeY + 28))
$p2 = New-Object System.Drawing.PointF(($badgeX + 24), ($badgeY + 36))
$p3 = New-Object System.Drawing.PointF(($badgeX + 40), ($badgeY + 20))

$g.DrawLines($checkPen, @($p1, $p2, $p3))

# Save image
$bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose()
$bmp.Dispose()
$brush.Dispose()
$whiteBrush.Dispose()
$blueBrush.Dispose()
$pen.Dispose()
$checkPen.Dispose()

Write-Host "Created exact 640x360 white background logo at: $destPath"
