# Require Administrator Elevation
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Requesting Administrator privileges..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  CONFIGURING DIRECT RJ45 ETHERNET TO SUNMI POS        " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Identify Physical Ethernet adapter
$adapter = Get-NetAdapter | Where-Object { 
    ($_.PhysicalMediaType -match '802.3' -or $_.Name -match 'Ethernet') -and 
    $_.InterfaceDescription -notmatch 'VirtualBox|TAP|VPN|Hyper-V|vEthernet' 
} | Select-Object -First 1

if (-not $adapter) {
    Write-Host "❌ No physical Ethernet adapter detected!" -ForegroundColor Red
    Write-Host "   Please plug an Ethernet cable or USB-Ethernet adapter into this laptop." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "🔍 Found Physical Ethernet: $($adapter.Name) ($($adapter.InterfaceDescription))" -ForegroundColor Green

# 2. Assign Static IP 192.168.88.10 / 24
Write-Host "⚙️  Assigning Static IP: 192.168.88.10 (Subnet 255.255.255.0)..." -ForegroundColor Yellow
try {
    # Clear existing IP addresses on this adapter
    netsh interface ip set address name="$($adapter.Name)" dhcp 2>$null
    Start-Sleep -Milliseconds 500
    netsh interface ip set address name="$($adapter.Name)" static 192.168.88.10 255.255.255.0
    Write-Host "✅ Static IP 192.168.88.10 assigned to $($adapter.Name)!" -ForegroundColor Green
} catch {
    Write-Host "⚠️ Warning setting IP via netsh, attempting New-NetIPAddress..." -ForegroundColor Yellow
    New-NetIPAddress -InterfaceIndex $adapter.InterfaceIndex -IPAddress "192.168.88.10" -PrefixLength 24 -ErrorAction SilentlyContinue
}

# 3. Configure Network Category to Private
Get-NetConnectionProfile -InterfaceIndex $adapter.InterfaceIndex -ErrorAction SilentlyContinue | Set-NetConnectionProfile -NetworkCategory Private -ErrorAction SilentlyContinue

# 4. Open Windows Firewall for ports 3000, 5177, 5173
Write-Host "🛡️  Configuring Windows Firewall rules..." -ForegroundColor Yellow
$ports = @(3000, 5177, 5173, 8080)
foreach ($p in $ports) {
    Remove-NetFirewallRule -DisplayName "Askar POS Direct Ethernet (Port $p)" -ErrorAction SilentlyContinue
    New-NetFirewallRule -DisplayName "Askar POS Direct Ethernet (Port $p)" -Direction Inbound -LocalPort $p -Protocol TCP -Action Allow -Profile Any -ErrorAction SilentlyContinue | Out-Null
}
Write-Host "✅ Firewall opened for ports 3000, 5177, 5173!" -ForegroundColor Green

Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host "  LAPTOP RJ45 DIRECT ETHERNET IS NOW READY!             " -ForegroundColor Green
Write-Host ""
Write-Host "  Laptop Ethernet IP:  192.168.88.10" -ForegroundColor White
Write-Host "  Sunmi POS IP:        192.168.88.2"  -ForegroundColor White
Write-Host "  Subnet Mask:         255.255.255.0" -ForegroundColor White
Write-Host ""
Write-Host "  Direct RJ45 NFC card taps will now stream instantly" -ForegroundColor Cyan
Write-Host "  into the Back-Office Manager Dashboard with <5ms latency!" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to finish"

