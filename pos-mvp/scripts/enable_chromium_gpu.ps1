# Script to ensure Chromium GPU Rasterization flags are enabled on attached Sunmi/Android devices
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
if (-not (Test-Path $adb)) {
    $adb = "adb"
}

Write-Host "Configuring Chromium GPU Rasterization flags on Android device..." -ForegroundColor Cyan
& $adb shell "echo '_ --enable-gpu-rasterization --force-gpu-rasterization --ignore-gpu-blocklist --enable-zero-copy' > /data/local/tmp/webview-command-line"
& $adb shell "chmod 777 /data/local/tmp/webview-command-line"
& $adb shell "echo '_ --enable-gpu-rasterization --force-gpu-rasterization --ignore-gpu-blocklist --enable-zero-copy' > /data/local/tmp/chrome-command-line"
& $adb shell "chmod 777 /data/local/tmp/chrome-command-line"

Write-Host "Current /data/local/tmp/webview-command-line:" -ForegroundColor Green
& $adb shell cat /data/local/tmp/webview-command-line
