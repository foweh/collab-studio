package com.collabstudio;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.appcompat.app.AppCompatActivity;

/**
 * Collab Studio Android 主界面
 * WebView 加载本地 Node.js 服务
 * 支持触屏、键盘弹出、同步功能
 */
public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private NodeService nodeService;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);
        setupWebView();

        // 启动 Node.js 服务
        nodeService = new NodeService();
        nodeService.startNodeServer(this, () -> {
            // Node.js 服务启动后加载 localhost
            runOnUiThread(() -> {
                webView.loadUrl("http://localhost:3000");
            });
        });
    }

    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setDefaultTextEncodingName("UTF-8");

        // 触屏优化
        settings.setSupportZoom(true);
        settings.setSupportMultipleWindows(false);

        // 允许混合内容（http 页面在 https 下加载）
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // 所有请求都在 WebView 内处理
                view.loadUrl(url);
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient());

        // 加载启动页面（等待 Node.js 启动）
        webView.loadUrl("file:///android_asset/loading.html");
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        // 返回键支持 WebView 后退
        if (keyCode == KeyEvent.KEYCODE_BACK && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onDestroy() {
        if (nodeService != null) {
            nodeService.stopNodeServer();
        }
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
