# push_sunmi_adb.ps1
# Automated ADB deployer for Sunmi POS Terminal
param(
    [string]$DeviceIp = ""
)

$ErrorActionPreference = "Continue"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  ASKAR ERP - SUNMI TERMINAL ADB DEPLOYMENT TOOL  " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# 1. Locate ADB
$adbPath = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
if (-not (Test-Path $adbPath)) {
    $adbCmd = Get-Command adb -ErrorAction SilentlyContinue
    if ($adbCmd) {
        $adbPath = $adbCmd.Source
    } else {
        Write-Error "ADB executable not found. Please ensure Android SDK platform-tools is installed."
        exit 1
    }
}
Write-Host "[+] ADB Path: $adbPath" -ForegroundColor Green

# 2. Locate APK
$posDir = "C:\Users\ACER\Desktop\erp\pos-mvp"
$apkPath = "$posDir\updated-sunmi.apk"
if (-not (Test-Path $apkPath)) {
    Write-Error "Target APK not found at $apkPath. Please run build_and_package_apk.ps1 first."
    exit 1
}
$apkSize = [math]::Round((Get-Item $apkPath).Length / 1MB, 2)
Write-Host "[+] APK Path: $apkPath ($apkSize MB)" -ForegroundColor Green

# 3. Handle Wireless Connect if IP passed
if ($DeviceIp -ne "") {
    Write-Host "[*] Attempting Wi-Fi ADB connection to $DeviceIp..." -ForegroundColor Yellow
    & $adbPath connect $DeviceIp
}

# 4. Check connected devices
$devicesOutput = & $adbPath devices -l
Write-Host "`nAttached Devices:" -ForegroundColor Gray
Write-Host $devicesOutput

$lines = $devicesOutput -split "`r?`n" | Where-Object { $_.Trim() -ne "" -and $_ -notmatch "^List of devices" }
$validDevices = @()
foreach ($line in $lines) {
    if ($line -match "^(\S+)\s+device\b") {
        $validDevices += $matches[1]
    } elseif ($line -match "^(\S+)\s+unauthorized\b") {
        Write-Host "[!] Device $($matches[1]) is UNAUTHORIZED. Please accept the USB Debugging prompt on the Sunmi screen!" -ForegroundColor Yellow
    }
}

if ($validDevices.Count -eq 0) {
    Write-Host "`n[-] No authorized Android device detected by ADB." -ForegroundColor Red
    Write-Host "`nTo connect Sunmi to this laptop:" -ForegroundColor Yellow
    Write-Host "  OPTION A (USB Cable):" -ForegroundColor White
    Write-Host "    1. Plug a USB-C or Micro-USB data cable from the Sunmi terminal into this laptop."
    Write-Host "    2. On the Sunmi screen, go to Settings -> About Device -> Tap 'Build Number' 7 times."
    Write-Host "    3. Go to Developer Options -> Turn ON 'USB Debugging'."
    Write-Host "    4. When prompted 'Allow USB debugging?', check 'Always allow' and tap OK."
    Write-Host "`n  OPTION B (Wi-Fi ADB):" -ForegroundColor White
    Write-Host "    1. Connect Sunmi to same Wi-Fi (192.168.8.x)."
    Write-Host "    2. Enable Wireless Debugging on the Sunmi terminal."
    Write-Host "    3. Run: .\push_sunmi_adb.ps1 -DeviceIp <SUNMI_IP>:<PORT>"
    Write-Host "`n  OPTION C (Instant One-Tap Browser Install):" -ForegroundColor White
    Write-Host "    Open Chrome or the built-in Browser on the Sunmi terminal and visit:"
    Write-Host "    http://192.168.8.7:3000/api/download/apk" -ForegroundColor Cyan
    Write-Host "    (The APK will download and prompt to install directly without cables)."
    exit 1
}

$targetDevice = $validDevices[0]
Write-Host "`n[+] Target Device selected: $targetDevice" -ForegroundColor Green

# 5. Push and Install
Write-Host "[*] Installing $apkPath onto $targetDevice (this may take 10-20 seconds)..." -ForegroundColor Yellow
$installRes = & $adbPath -s $targetDevice install -r -d $apkPath
Write-Host $installRes

if ($installRes -match "Success") {
    Write-Host "`n[SUCCESS] APK successfully installed on Sunmi!" -ForegroundColor Green
    
    # 6. Launch Application
    Write-Host "[*] Launching Askar POS on terminal screen..." -ForegroundColor Yellow
    & $adbPath -s $targetDevice shell am start -n com.retail.pos/.MainActivity
    Write-Host "[+] App launched successfully: com.retail.pos/.MainActivity" -ForegroundColor Green
} else {
    Write-Host "`n[!] Install encountered an issue: $installRes" -ForegroundColor Red
}
