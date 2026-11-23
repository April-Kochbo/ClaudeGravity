$fontDir = "E:\BetterGravity\fonts"
if (-not (Test-Path $fontDir)) {
    New-Item -ItemType Directory -Force -Path $fontDir | Out-Null
}

$ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
$wc = New-Object System.Net.WebClient
$wc.Headers.Add("User-Agent", $ua)

Write-Host "Fetching Google Fonts CSS for JetBrains Mono, Newsreader, and Inter..."
$url = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&display=swap"
$css = $wc.DownloadString($url)

# Save fonts.css
$cssPath = Join-Path $fontDir "fonts.css"
[System.IO.File]::WriteAllText($cssPath, $css, [System.Text.Encoding]::UTF8)
Write-Host "Saved fonts.css ($($css.Length) bytes)"

# Download Latin woff2 files for local zero-latency caching
$pattern = '(?s)/\* latin \*/\s*@font-face\s*\{[^}]*font-family:\s*''([^'']+)''[^}]*font-weight:\s*(\d+)[^}]*src:\s*url\((https://[^\)]+\.woff2)\)'
$regex = [regex]$pattern
$matches = $regex.Matches($css)

Write-Host "Found $($matches.Count) Latin font files to download locally."
$localCss = ""

foreach ($m in $matches) {
    $family = $m.Groups[1].Value
    $weight = $m.Groups[2].Value
    $fontUrl = $m.Groups[3].Value
    
    $cleanFamily = $family -replace '\s+', ''
    $fileName = "$cleanFamily-$weight.woff2"
    $localFile = Join-Path $fontDir $fileName
    
    Write-Host "Downloading $family ($weight) -> $fileName..."
    $wc.DownloadFile($fontUrl, $localFile)
    
    $localCss += @"
@font-face {
  font-family: '$family';
  font-style: normal;
  font-weight: $weight;
  font-display: swap;
  src: url('./$fileName') format('woff2');
}
"@ + "`n"
}

if ($localCss.Length -gt 0) {
    $localCssPath = Join-Path $fontDir "local-fonts.css"
    [System.IO.File]::WriteAllText($localCssPath, $localCss, [System.Text.Encoding]::UTF8)
    Write-Host "Saved local-fonts.css with local woff2 files!"
}
