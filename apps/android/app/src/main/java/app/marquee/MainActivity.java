package app.marquee;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.net.HttpURLConnection;
import java.net.URL;

/** Shows the Marquee web UI, served by the Node server running inside this app. */
public class MainActivity extends Activity {
    private static final String BASE = "http://127.0.0.1:" + NodeRuntime.PORT;
    private FrameLayout root;
    private WebView web;
    private TextView splash;
    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(11, 11, 12));

        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(11, 11, 12));
        web.setVisibility(View.INVISIBLE);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setSupportZoom(false);
        web.addJavascriptInterface(new Bridge(), "MarqueeNative");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("127.0.0.1".equals(uri.getHost())) return false;
                // Links that leave the app (TMDB, my.telegram.org) open in the browser.
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (ActivityNotFoundException ignored) {
                }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                fullscreenView = view;
                fullscreenCallback = callback;
                root.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                setFullscreenUi(true);
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
            }

            @Override
            public void onHideCustomView() {
                if (fullscreenView != null) root.removeView(fullscreenView);
                fullscreenView = null;
                fullscreenCallback = null;
                setFullscreenUi(false);
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
            }
        });

        splash = new TextView(this);
        splash.setText("Marquee");
        splash.setTextColor(Color.rgb(243, 241, 236));
        splash.setTextSize(30);
        splash.setTypeface(android.graphics.Typeface.SERIF);
        splash.setGravity(Gravity.CENTER);
        splash.setPadding(48, 0, 48, 0);

        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.addView(splash, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        if (Build.VERSION.SDK_INT >= 33) requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, 1);
        Intent service = new Intent(this, NodeService.class);
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(service); else startService(service);
        waitForServer();
    }

    /** Poll the local server, then show the app. The first start copies files and can take a few seconds. */
    private void waitForServer() {
        new Thread(() -> {
            for (int i = 0; i < 240; i++) {
                try {
                    HttpURLConnection c = (HttpURLConnection) new URL(BASE + "/api/status").openConnection();
                    c.setConnectTimeout(500);
                    c.setReadTimeout(1000);
                    if (c.getResponseCode() == 200) {
                        runOnUiThread(() -> {
                            web.loadUrl(BASE + "/");
                            web.setVisibility(View.VISIBLE);
                            splash.animate().alpha(0f).setDuration(300).withEndAction(() -> splash.setVisibility(View.GONE));
                        });
                        return;
                    }
                } catch (Exception ignored) {
                }
                try {
                    Thread.sleep(250);
                } catch (InterruptedException e) {
                    return;
                }
            }
            runOnUiThread(() -> splash.setText("Marquee could not start.\nClose the app and open it again."));
        }).start();
    }

    private void setFullscreenUi(boolean on) {
        int flags = on
            ? View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            : View.SYSTEM_UI_FLAG_VISIBLE;
        getWindow().getDecorView().setSystemUiVisibility(flags);
    }

    @Override
    public void onBackPressed() {
        if (fullscreenCallback != null) {
            fullscreenCallback.onCustomViewHidden();
        } else if (web.canGoBack()) {
            web.goBack();
        } else {
            // Keep the server running so the library stays up to date; the notification has Quit.
            moveTaskToBack(true);
        }
    }

    /** Called from the page as window.MarqueeNative. */
    private final class Bridge {
        @JavascriptInterface
        public void openExternal(String url, String title) {
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(Uri.parse(url), "video/*");
                intent.putExtra("title", title);
                try {
                    startActivity(Intent.createChooser(intent, title));
                } catch (ActivityNotFoundException e) {
                    Toast.makeText(MainActivity.this, "No video player found. Install VLC to play this file.", Toast.LENGTH_LONG).show();
                }
            });
        }
    }
}
