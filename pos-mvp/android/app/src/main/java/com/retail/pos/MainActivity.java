package com.retail.pos;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {
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
    }

    /**
     * Intercept physical hardware volume keys on Feitian F100 terminal
     * Maps Volume Up / Down directly to WebView DOM events for hands-off quantity adjustment
     * Suppresses native Android OS volume slider HUD
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

        return super.dispatchKeyEvent(event);
    }
}
