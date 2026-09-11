Add-Type -AssemblyName System.Drawing

$sizes = @(16, 48, 128)
$iconsDir = Join-Path $PSScriptRoot '..\icons'
New-Item -ItemType Directory -Force -Path $iconsDir | Out-Null

foreach ($size in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'HighQuality'
    $g.Clear([System.Drawing.Color]::Transparent)

    # Purple circle
    $purple = [System.Drawing.Color]::FromArgb(145, 70, 255)
    $brush = New-Object System.Drawing.SolidBrush($purple)
    $g.FillEllipse($brush, 0, 0, $size - 1, $size - 1)

    # White rewind triangles
    $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $cx = $size / 2
    $cy = $size / 2
    $triSize = $size * 0.25

    # Left triangle (pointing left)
    $tri1 = @(
        (New-Object System.Drawing.PointF(($cx - $triSize * 0.1), ($cy - $triSize))),
        (New-Object System.Drawing.PointF(($cx - $triSize * 1.1), $cy)),
        (New-Object System.Drawing.PointF(($cx - $triSize * 0.1), ($cy + $triSize)))
    )
    $g.FillPolygon($white, $tri1)

    # Right triangle (pointing left)
    $tri2 = @(
        (New-Object System.Drawing.PointF(($cx + $triSize * 0.9), ($cy - $triSize))),
        (New-Object System.Drawing.PointF(($cx - $triSize * 0.1), $cy)),
        (New-Object System.Drawing.PointF(($cx + $triSize * 0.9), ($cy + $triSize)))
    )
    $g.FillPolygon($white, $tri2)

    $outPath = Join-Path $iconsDir "icon$size.png"
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Created $outPath"
}
