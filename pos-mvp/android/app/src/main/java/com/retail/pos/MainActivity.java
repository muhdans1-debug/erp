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

        // Hardware-accelerated Sunmi POS performance tuning
        try {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
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
}
