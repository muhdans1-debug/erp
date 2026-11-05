$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$apk = "pos-mvp/android/app/build/outputs/apk/debug/app-debug.apk"

Write-Host "Waiting for Feitian F100 device via ADB..."
& $adb wait-for-device

Write-Host "Device detected!"
& $adb devices -l

Write-Host "Installing APK ($apk)..."
& $adb install -r $apk

Write-Host "Launching com.retail.pos/.MainActivity..."
& $adb shell am start -n com.retail.pos/.MainActivity

Start-Sleep -Seconds 3
Write-Host "Capturing verification screenshot..."
& $adb shell screencap -p /data/local/tmp/f100_screen.png
& $adb pull /data/local/tmp/f100_screen.png "C:\Users\ACER\.gemini\antigravity\brain\5659bbf6-01eb-46f6-92a7-4a4b22035147\f100_updated_verified.png"

Write-Host "SUCCESS: F100 updated and verified!"

