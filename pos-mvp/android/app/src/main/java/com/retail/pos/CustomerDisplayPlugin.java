package com.retail.pos;

import android.app.Presentation;
import android.content.Context;
import android.hardware.display.DisplayManager;
import android.net.Uri;
import android.os.Bundle;
import android.view.Display;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.graphics.Color;

import java.io.InputStream;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

import com.getcapacitor.Bridge;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "CustomerDisplay")
public class CustomerDisplayPlugin extends Plugin {
    private CustomerWebPresentation presentation;

    @Override
    public void load() {
        android.util.Log.i("CustomerDisplayPlugin", "CustomerDisplayPlugin loaded, launching secondary presentation...");
        startSecondaryDisplay("http://localhost/?view=customer-display");
    }

    public void startSecondaryDisplay(String targetUrl) {
        DisplayManager dm = (DisplayManager) getContext().getSystemService(Context.DISPLAY_SERVICE);
        Display[] presentationDisplays = dm.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION);
        Display targetDisplay = null;

        if (presentationDisplays != null && presentationDisplays.length > 0) {
            targetDisplay = presentationDisplays[0];
            android.util.Log.i("CustomerDisplayPlugin", "Found presentation category display: " + targetDisplay.getName());
        } else {
            Display[] allDisplays = dm.getDisplays();
            if (allDisplays != null && allDisplays.length > 1) {
                targetDisplay = allDisplays[1];
                android.util.Log.i("CustomerDisplayPlugin", "Found secondary display in all displays: " + targetDisplay.getName());
            }
        }

        if (targetDisplay != null) {
            final Display secondaryDisplay = targetDisplay;
            getActivity().runOnUiThread(() -> {
                try {
                    if (presentation != null) {
                        try {
                            presentation.dismiss();
                        } catch (Exception ignored) {}
                    }
                    presentation = new CustomerWebPresentation(getContext(), secondaryDisplay, targetUrl);
                    presentation.show();
                    android.util.Log.i("CustomerDisplayPlugin", "Secondary customer web presentation shown on: " + secondaryDisplay.getName());
                } catch (Exception e) {
                    android.util.Log.e("CustomerDisplayPlugin", "Error showing customer presentation: " + e.getMessage(), e);
                }
            });
        } else {
            android.util.Log.w("CustomerDisplayPlugin", "No secondary display found.");
        }
    }

    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url", "http://localhost/?view=customer-display");
        getActivity().runOnUiThread(() -> {
            if (presentation != null && presentation.getWebView() != null) {
                presentation.getWebView().loadUrl(url);
            } else {
                startSecondaryDisplay(url);
            }
        });
        call.resolve();
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        DisplayManager dm = (DisplayManager) getContext().getSystemService(Context.DISPLAY_SERVICE);
        Display[] presentationDisplays = dm.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION);
        boolean available = (presentationDisplays != null && presentationDisplays.length > 0) || (dm.getDisplays().length > 1);
        JSObject ret = new JSObject();
        ret.put("available", available);
        ret.put("displayCount", dm.getDisplays().length);
        call.resolve(ret);
    }

    class CustomerWebPresentation extends Presentation {
        private WebView webView;
        private String initialUrl;

        public CustomerWebPresentation(Context outerContext, Display display, String url) {
            super(outerContext, display);
            this.initialUrl = url;
        }

        @Override
        protected void onCreate(Bundle savedInstanceState) {
            super.onCreate(savedInstanceState);
            
            FrameLayout root = new FrameLayout(getContext());
            root.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 
                ViewGroup.LayoutParams.MATCH_PARENT
            ));
            root.setBackgroundColor(Color.parseColor("#0F172A")); // Slate-900

            webView = new WebView(getContext());
            webView.setLayoutParams(new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, 
                FrameLayout.LayoutParams.MATCH_PARENT
            ));
            webView.setBackgroundColor(Color.parseColor("#0F172A"));
            webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setAllowFileAccess(true);
            settings.setAllowContentAccess(true);
            settings.setAllowFileAccessFromFileURLs(true);
            settings.setAllowUniversalAccessFromFileURLs(true);
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);
            settings.setLoadWithOverviewMode(true);
            settings.setUseWideViewPort(true);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

            try {
                WebView.setWebContentsDebuggingEnabled(true);
            } catch (Exception ignored) {}

            webView.setWebChromeClient(new WebChromeClient() {
                @Override
                public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                    android.util.Log.i("CustomerWebPresentation", "[JS Console] " + consoleMessage.message() +
                            " (" + consoleMessage.sourceId() + ":" + consoleMessage.lineNumber() + ")");
                    return true;
                }
            });

            // Stream APK assets for localhost requests so secondary WebView runs on http://localhost
            // and seamlessly shares BroadcastChannel and localStorage with the main checkout screen.
            webView.setWebViewClient(new WebViewClient() {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    if (request != null && request.getUrl() != null) {
                        WebResourceResponse response = interceptAssetRequest(request.getUrl());
                        if (response != null) return response;
                    }
                    return super.shouldInterceptRequest(view, request);
                }

                @Override
                public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
                    if (url != null) {
                        WebResourceResponse response = interceptAssetRequest(Uri.parse(url));
                        if (response != null) return response;
                    }
                    return super.shouldInterceptRequest(view, url);
                }

                @Override
                public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                    android.util.Log.w("CustomerWebPresentation", "Failed to load " + failingUrl + ": (" + errorCode + ") " + description);
                }

                private WebResourceResponse interceptAssetRequest(Uri uri) {
                    String host = uri.getHost();
                    if (host != null && (host.equalsIgnoreCase("localhost") || host.equals("127.0.0.1"))) {
                        String rawPath = uri.getPath();
                        String assetPath;
                        if (rawPath == null || rawPath.isEmpty() || rawPath.equals("/") || !rawPath.contains(".")) {
                            assetPath = "public/index.html";
                        } else {
                            assetPath = "public" + (rawPath.startsWith("/") ? rawPath : "/" + rawPath);
                        }

                        try {
                            InputStream is = getContext().getAssets().open(assetPath);
                            String mimeType = "text/html";
                            String encoding = "UTF-8";

                            if (assetPath.endsWith(".js") || assetPath.endsWith(".mjs")) {
                                mimeType = "application/javascript";
                            } else if (assetPath.endsWith(".css")) {
                                mimeType = "text/css";
                            } else if (assetPath.endsWith(".svg")) {
                                mimeType = "image/svg+xml";
                            } else if (assetPath.endsWith(".png")) {
                                mimeType = "image/png";
                                encoding = null;
                            } else if (assetPath.endsWith(".jpg") || assetPath.endsWith(".jpeg")) {
                                mimeType = "image/jpeg";
                                encoding = null;
                            } else if (assetPath.endsWith(".webp")) {
                                mimeType = "image/webp";
                                encoding = null;
                            } else if (assetPath.endsWith(".json")) {
                                mimeType = "application/json";
                            } else if (assetPath.endsWith(".woff2")) {
                                mimeType = "font/woff2";
                                encoding = null;
                            } else if (assetPath.endsWith(".woff")) {
                                mimeType = "font/woff";
                                encoding = null;
                            } else if (assetPath.endsWith(".ttf")) {
                                mimeType = "font/ttf";
                                encoding = null;
                            }

                            WebResourceResponse res = new WebResourceResponse(mimeType, encoding, is);
                            Map<String, String> headers = new HashMap<>();
                            headers.put("Access-Control-Allow-Origin", "*");
                            headers.put("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
                            headers.put("Access-Control-Allow-Headers", "*");
                            res.setResponseHeaders(headers);
                            return res;
                        } catch (IOException e) {
                            android.util.Log.w("CustomerWebPresentation", "Asset not found: " + assetPath + ", falling back to index.html");
                            try {
                                InputStream is = getContext().getAssets().open("public/index.html");
                                WebResourceResponse res = new WebResourceResponse("text/html", "UTF-8", is);
                                Map<String, String> headers = new HashMap<>();
                                headers.put("Access-Control-Allow-Origin", "*");
                                headers.put("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
                                headers.put("Access-Control-Allow-Headers", "*");
                                res.setResponseHeaders(headers);
                                return res;
                            } catch (Exception ex) {
                                android.util.Log.e("CustomerWebPresentation", "Fallback index.html error: " + ex.getMessage());
                            }
                        }
                    }
                    return null;
                }
            });

            root.addView(webView);
            setContentView(root);

            android.util.Log.i("CustomerWebPresentation", "Loading URL on secondary screen: " + initialUrl);
            webView.loadUrl(initialUrl);
        }

        public WebView getWebView() {
            return webView;
        }
    }
}
