package com.retail.pos;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {

    private long lastNfcScanTime = 0;
    private String lastNfcTag = "";

    private synchronized boolean isDuplicateNfcScan(String tagUid) {
        long now = System.currentTimeMillis();
        if (tagUid != null && tagUid.equalsIgnoreCase(lastNfcTag) && (now - lastNfcScanTime < 2500)) {
            return true;
        }
        lastNfcTag = tagUid != null ? tagUid : "";
        lastNfcScanTime = now;
        return false;
    }

    private final StringBuilder nativeKeyBuffer = new StringBuilder();
    private long lastNativeKeyTime = 0;
    private final android.os.Handler nativeKeyHandler = new android.os.Handler(android.os.Looper.getMainLooper());
    private final Runnable nativeKeyFlushRunnable = () -> {
        synchronized (nativeKeyBuffer) {
            if (nativeKeyBuffer.length() >= 4) {
                final String code = nativeKeyBuffer.toString().trim();
                nativeKeyBuffer.setLength(0);
                dispatchScannedCodeToWebView(code);
            } else {
                nativeKeyBuffer.setLength(0);
            }
        }
    };

    private void dispatchScannedCodeToWebView(final String cleanCode) {
        if (cleanCode == null || cleanCode.trim().isEmpty()) return;
        final String code = cleanCode.trim();
        android.util.Log.i("MainActivity", "⚡ Dispatching Scanned Barcode to WebView: " + code);
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            webView.post(() -> {
                String escaped = code.replace("\\", "\\\\").replace("'", "\\'");
                // Pure numeric codes (e.g. EAN-13, EAN-8, UPC) are retail grocery barcodes, NEVER NFC tags.
                // Only treat as NFC card if delimited (contains ':' or '-') or hex containing letter A-F.
                boolean isHexNfc = (code.contains(":") || code.contains("-"))
                        || (code.matches("(?i)^[0-9A-F]{8,32}$") && code.matches(".*[a-zA-Z].*"));
                if (isHexNfc) {
                    String nfcId = code.replace(":", "").replace("-", "").toUpperCase();
                    if (isDuplicateNfcScan(nfcId)) {
                        android.util.Log.d("MainActivity", "⏳ Suppressing duplicate NFC scanner broadcast: " + nfcId);
                        return;
                    }
                    android.util.Log.i("MainActivity", "📡 Dispatching Sunmi NFC Scan Event: " + nfcId);
                    relayTagToCloudAsync(nfcId);
                    webView.evaluateJavascript(
                        "window.dispatchEvent(new CustomEvent('sunmi-nfc-scan', { detail: { nfcId: '" + nfcId + "', tag_id: '" + escaped + "' } }));" +
                        "window.dispatchEvent(new CustomEvent('sunmiBarcodeScan', { detail: { barcode: '" + escaped + "' } }));",
                        null
                    );
                } else {
                    webView.evaluateJavascript(
                        "window.dispatchEvent(new CustomEvent('sunmiBarcodeScan', { detail: { barcode: '" + escaped + "' } }));",
                        null
                    );
                }
            });
        }
    }

    private final BroadcastReceiver scannerReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent == null) return;
            String action = intent.getAction();
            String barcode = null;

            if ("com.sunmi.scanner.ACTION_DATA_CODE_RECEIVED".equals(action)) {
                barcode = intent.getStringExtra("data");
                if (barcode == null) {
                    byte[] bytes = intent.getByteArrayExtra("sourcebytes");
                    if (bytes == null) bytes = intent.getByteArrayExtra("source_byte");
                    if (bytes != null) barcode = new String(bytes);
                }
            } else if ("sunmi.intent.action.SCAN_RESULT".equals(action)) {
                barcode = intent.getStringExtra("data");
            } else {
                barcode = intent.getStringExtra("data");
                if (barcode == null) barcode = intent.getStringExtra("barcode");
                if (barcode == null) barcode = intent.getStringExtra("scannerdata");
            }

            if (barcode != null && !barcode.trim().isEmpty()) {
                final String cleanCode = barcode.trim();
                android.util.Log.i("MainActivity", "⚡ Sunmi Scanner Broadcast Intercepted: " + cleanCode);
                dispatchScannedCodeToWebView(cleanCode);
            }
        }
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CustomerDisplayPlugin.class);
        super.onCreate(savedInstanceState);

        // Hardware-accelerated Sunmi POS performance tuning & DevTools inspection
        try {
            WebView.setWebContentsDebuggingEnabled(true);
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

                WebSettings settings = webView.getSettings();
                settings.setRenderPriority(WebSettings.RenderPriority.HIGH);
                settings.setCacheMode(WebSettings.LOAD_DEFAULT);
                settings.setDomStorageEnabled(true);
                settings.setDatabaseEnabled(true);
            }
        } catch (Exception e) {
            android.util.Log.w("MainActivity", "WebView hardware optimization notice: " + e.getMessage());
        }

        // Initialize Customer Display Presentation on secondary screen
        try {
            PluginHandle handle = getBridge().getPlugin("CustomerDisplay");
            if (handle != null && handle.getInstance() != null) {
                ((CustomerDisplayPlugin) handle.getInstance()).load();
            }
        } catch (Exception e) {
            android.util.Log.w("MainActivity", "CustomerDisplay initialization notice: " + e.getMessage());
        }

        // Register Zero-Latency Sunmi Hardware Scanner Broadcast Receiver
        try {
            IntentFilter filter = new IntentFilter();
            filter.addAction("com.sunmi.scanner.ACTION_DATA_CODE_RECEIVED");
            filter.addAction("sunmi.intent.action.SCAN_RESULT");
            filter.addAction("com.android.server.scannerservice.broadcast");
            filter.addAction("android.intent.action.SCANNER_RESULT");
            filter.addAction("com.sunmi.scan");
            filter.addAction("com.summi.scan");
            registerReceiver(scannerReceiver, filter);

            configureSunmiScannerBroadcastMode();
        } catch (Exception e) {
            android.util.Log.w("MainActivity", "Scanner receiver registration notice: " + e.getMessage());
        }
    }

    private void configureSunmiScannerBroadcastMode() {
        try {
            // 1. General Sunmi Scanner setting to Broadcast Mode (type = 2)
            Intent configIntent = new Intent("com.sunmi.scanner.ACTION_BAR_DEVICES_SETTING");
            configIntent.putExtra("type", 2); // 2 = Broadcast mode
            configIntent.putExtra("toast", false);
            sendBroadcast(configIntent);

            // 2. Configure known Sunmi hardware scanner devices
            int[][] knownDevices = {
                {102, 7847},  // Sunmi built-in / Blink
                {65, 12879},  // Sunmi handheld 2D scanner
                {528, 536}    // Sunmi integrated optical module
            };
            for (int[] dev : knownDevices) {
                Intent devIntent = new Intent("com.sunmi.scanner.ACTION_BAR_DEVICES_SETTING");
                devIntent.putExtra("vid", dev[0]);
                devIntent.putExtra("pid", dev[1]);
                devIntent.putExtra("type", 2);
                devIntent.putExtra("toast", false);
                sendBroadcast(devIntent);
            }

            // 3. Enumerate connected USB devices to configure any attached USB scanner gun to broadcast
            android.hardware.usb.UsbManager usbManager = (android.hardware.usb.UsbManager) getSystemService(Context.USB_SERVICE);
            if (usbManager != null) {
                for (android.hardware.usb.UsbDevice device : usbManager.getDeviceList().values()) {
                    Intent usbDevIntent = new Intent("com.sunmi.scanner.ACTION_BAR_DEVICES_SETTING");
                    usbDevIntent.putExtra("name", device.getProductName());
                    usbDevIntent.putExtra("vid", device.getVendorId());
                    usbDevIntent.putExtra("pid", device.getProductId());
                    usbDevIntent.putExtra("type", 2);
                    usbDevIntent.putExtra("toast", false);
                    sendBroadcast(usbDevIntent);
                }
            }

            // 4. Update system settings if possible
            try {
                android.provider.Settings.Global.putString(
                    getContentResolver(),
                    "sunmi_scanner_devices",
                    "102:7847:2-65:12879:2-528:536:2"
                );
            } catch (Exception ignored) {}
        } catch (Exception e) {
            android.util.Log.w("MainActivity", "Configuring Sunmi scanner broadcast mode notice: " + e.getMessage());
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent == null) return;
        String action = intent.getAction();
        if (NfcAdapter.ACTION_TAG_DISCOVERED.equals(action)
                || NfcAdapter.ACTION_TECH_DISCOVERED.equals(action)
                || NfcAdapter.ACTION_NDEF_DISCOVERED.equals(action)) {
            Tag tag = intent.getParcelableExtra(NfcAdapter.EXTRA_TAG);
            byte[] id = tag != null ? tag.getId() : intent.getByteArrayExtra(NfcAdapter.EXTRA_ID);
            if (id != null) {
                StringBuilder sb = new StringBuilder();
                for (byte b : id) {
                    sb.append(String.format("%02X", b));
                }
                final String tagUid = sb.toString();
                if (isDuplicateNfcScan(tagUid)) {
                    android.util.Log.d("MainActivity", "⏳ Suppressing duplicate NFC intent: " + tagUid);
                    return;
                }
                android.util.Log.i("MainActivity", "⚡ Native NFC Intent Discovered Tag: " + tagUid);
                relayTagToCloudAsync(tagUid);
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView != null) {
                    webView.post(() -> {
                        webView.evaluateJavascript(
                            "window.dispatchEvent(new CustomEvent('sunmi-nfc-scan', { detail: { nfcId: '" + tagUid + "', tag_id: '" + tagUid + "' } }));",
                            null
                        );
                    });
                }
            }
        }
    }

    private void relayTagToCloudAsync(final String tagUid) {
        if (tagUid == null || tagUid.trim().isEmpty()) return;
        new Thread(() -> {
            java.net.HttpURLConnection conn = null;
            try {
                java.net.URL url = new java.net.URL("https://askar-edge-api.layali-askar-pos.workers.dev/api/nfc/relay");
                conn = (java.net.HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("x-pos-client", "store-pos");
                conn.setConnectTimeout(4000);
                conn.setReadTimeout(4000);
                conn.setDoOutput(true);

                String jsonPayload = "{\"tag_id\":\"" + tagUid.trim().toUpperCase() + "\",\"terminalId\":\"Sunmi D2mini (Native)\"}";
                try (java.io.OutputStream os = conn.getOutputStream()) {
                    os.write(jsonPayload.getBytes(java.nio.charset.StandardCharsets.UTF_8));
                }
                int code = conn.getResponseCode();
                android.util.Log.i("MainActivity", "☁️ Native NFC Relay Sent: " + tagUid + " -> HTTP " + code);
            } catch (Exception e) {
                android.util.Log.w("MainActivity", "☁️ Native NFC Relay failed: " + e.getMessage());
            } finally {
                if (conn != null) {
                    conn.disconnect();
                }
            }
        }).start();
    }

    @Override
    public void onResume() {
        super.onResume();
        try {
            NfcAdapter nfcAdapter = NfcAdapter.getDefaultAdapter(this);
            if (nfcAdapter != null && nfcAdapter.isEnabled()) {
                Intent intent = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
                PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT);
                nfcAdapter.enableForegroundDispatch(this, pendingIntent, null, null);
            }
        } catch (Exception e) {
            android.util.Log.w("MainActivity", "NFC foreground dispatch error: " + e.getMessage());
        }
    }

    @Override
    public void onPause() {
        try {
            NfcAdapter nfcAdapter = NfcAdapter.getDefaultAdapter(this);
            if (nfcAdapter != null) {
                nfcAdapter.disableForegroundDispatch(this);
            }
        } catch (Exception e) {
            // Ignore
        }
        super.onPause();
    }

    @Override
    public void onDestroy() {
        try {
            nativeKeyHandler.removeCallbacks(nativeKeyFlushRunnable);
            unregisterReceiver(scannerReceiver);
        } catch (Exception e) {
            // Ignore if not registered
        }
        super.onDestroy();
    }

    /**
     * Intercept physical hardware volume keys on Feitian F100 terminal
     * Maps Volume Up / Down directly to WebView DOM events for hands-off quantity adjustment
     * Suppresses native Android OS volume slider HUD
     * 
     * Intercepts physical USB HID barcode scanners and Sunmi keyboard wedge input
     * at native OS level with zero latency, buffer-safe sliding window, and Enter/Tab triggers.
     */
    @Override
    public boolean dispatchKeyEvent(android.view.KeyEvent event) {
        int action = event.getAction();
        int keyCode = event.getKeyCode();

        if (keyCode == android.view.KeyEvent.KEYCODE_VOLUME_UP) {
            if (action == android.view.KeyEvent.ACTION_DOWN) {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView != null) {
                    webView.post(() -> webView.evaluateJavascript(
                        "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'VolumeUp', keyCode: 24, which: 24, bubbles: true }));",
                        null
                    ));
                }
            }
            return true; // Suppress native volume popup
        }

        if (keyCode == android.view.KeyEvent.KEYCODE_VOLUME_DOWN) {
            if (action == android.view.KeyEvent.ACTION_DOWN) {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView != null) {
                    webView.post(() -> webView.evaluateJavascript(
                        "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'VolumeDown', keyCode: 25, which: 25, bubbles: true }));",
                        null
                    ));
                }
            }
            return true; // Suppress native volume popup
        }

        // Hardware Barcode Scanner / USB HID Wedge Interception at Native Android OS level
        if (action == android.view.KeyEvent.ACTION_DOWN) {
            long now = System.currentTimeMillis();
            if (keyCode == android.view.KeyEvent.KEYCODE_ENTER 
                    || keyCode == android.view.KeyEvent.KEYCODE_NUMPAD_ENTER 
                    || keyCode == android.view.KeyEvent.KEYCODE_TAB) {
                nativeKeyHandler.removeCallbacks(nativeKeyFlushRunnable);
                String codeToDispatch = null;
                synchronized (nativeKeyBuffer) {
                    if (nativeKeyBuffer.length() >= 2) {
                        codeToDispatch = nativeKeyBuffer.toString().trim();
                        nativeKeyBuffer.setLength(0);
                    }
                }
                if (codeToDispatch != null && !codeToDispatch.isEmpty()) {
                    android.util.Log.i("MainActivity", "⚡ Native dispatchKeyEvent Intercepted Barcode: " + codeToDispatch);
                    dispatchScannedCodeToWebView(codeToDispatch);
                    return true; // Consume hardware Enter to prevent form submission or modal close
                }
            } else {
                int unicodeChar = event.getUnicodeChar();
                if (unicodeChar >= 32 && unicodeChar <= 126) {
                    synchronized (nativeKeyBuffer) {
                        // If pause between keystrokes exceeds 350ms, start a fresh barcode buffer
                        if (now - lastNativeKeyTime > 350) {
                            nativeKeyBuffer.setLength(0);
                        }
                        nativeKeyBuffer.append((char) unicodeChar);
                        lastNativeKeyTime = now;
                    }
                    nativeKeyHandler.removeCallbacks(nativeKeyFlushRunnable);
                    nativeKeyHandler.postDelayed(nativeKeyFlushRunnable, 300);
                }
            }
        }

        return super.dispatchKeyEvent(event);
    }
}
