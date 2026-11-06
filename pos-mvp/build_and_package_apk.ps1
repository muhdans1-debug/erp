# pos-mvp/build_and_package_apk.ps1
$ErrorActionPreference = "Stop"

$posDir = "C:\Users\ACER\Desktop\erp\pos-mvp"
$srcApk = "$posDir\android\app\build\outputs\apk\debug\app-debug.apk"
$unalignedApk = "$posDir\updated-unaligned.apk"
$targetApk = "$posDir\updated-sunmi.apk"
$distDir = "$posDir\dist"
$zipalign = "C:\Users\ACER\AppData\Local\Android\Sdk\build-tools\35.0.0\zipalign.exe"
$apksigner = "C:\Users\ACER\AppData\Local\Android\Sdk\build-tools\35.0.0\apksigner.bat"
$keystore = "$env:USERPROFILE\.android\debug.keystore"

Write-Host "1. Copying base APK..."
Copy-Item -Force $srcApk $unalignedApk

Write-Host "2. Injecting Vite dist into APK assets/public/..."
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$archive = [System.IO.Compression.ZipFile]::Open($unalignedApk, [System.IO.Compression.ZipArchiveMode]::Update)

# Remove old public assets
$oldEntries = @($archive.Entries | Where-Object { $_.FullName -like "assets/public/*" })
foreach ($entry in $oldEntries) {
    $entry.Delete()
}

# Add fresh dist files
$files = Get-ChildItem -Path $distDir -Recurse -File
foreach ($file in $files) {
    $relPath = $file.FullName.Substring($distDir.Length).TrimStart('\', '/') -replace '\\', '/'
    $entryName = "assets/public/$relPath"
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $entryName) | Out-Null
}

$archive.Dispose()
Write-Host "Injected $($files.Count) assets into APK."

Write-Host "3. Aligning APK with zipalign..."
if (Test-Path $targetApk) { Remove-Item -Force $targetApk }
& $zipalign -p -f 4 $unalignedApk $targetApk

Write-Host "4. Signing APK with apksigner..."
& $apksigner sign --ks $keystore --ks-pass pass:android --key-pass pass:android $targetApk

Write-Host "5. Verifying APK signature..."
& $apksigner verify $targetApk

Remove-Item -Force $unalignedApk
Write-Host "SUCCESS: Built and verified target APK"
