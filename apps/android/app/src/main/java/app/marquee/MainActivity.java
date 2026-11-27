package app.marquee;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.net.Uri;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.app.UiModeManager;
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
    private static final String BASE = "http://127.0.0.1:" + BuildConfigInfo.PORT;
    private FrameLayout root;
    private WebView web;
    private TextView splash;
    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        installCrashRecorder();
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
        // Full effects by default, everywhere. Only after a crash (or when chosen in Settings) is the
        // lighter look used; the page reads this marker from the user agent.
        if (prefs().getBoolean("lite", false)) {
            s.setUserAgentString(s.getUserAgentString() + " MarqueeLite");
        }
        web.addJavascriptInterface(new Bridge(), "MarqueeNative");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean onRenderProcessGone(WebView view, android.webkit.RenderProcessGoneDetail detail) {
                // The page's renderer died (often too heavy for the device). Keep the app alive,
                // switch to the lighter look and start over instead of closing.
                writeCrash("The web view process stopped (" + (detail.didCrash() ? "crash" : "killed by the system, low memory") + ")");
                prefs().edit().putBoolean("lite", true).apply();
                runOnUiThread(() -> {
                    root.removeView(web);
                    web.destroy();
                    recreate();
                });
                return true;
            }

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
        java.io.File crash = crashFile();
        if (crash.exists()) {
            String last = readFile(crash);
            //noinspection ResultOfMethodCallIgnored
            crash.delete();
            if (!last.isEmpty()) {
                showError("Marquee closed unexpectedly last time. The light look is now on.\n\n" + last);
                startServer();
                return;
            }
        }
        startServer();
        waitForServer();
    }

    private SharedPreferences prefs() {
        return getSharedPreferences("marquee", MODE_PRIVATE);
    }

    private boolean isTelevision() {
        UiModeManager ui = (UiModeManager) getSystemService(UI_MODE_SERVICE);
        return (ui != null && ui.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION)
            || !getPackageManager().hasSystemFeature(android.content.pm.PackageManager.FEATURE_TOUCHSCREEN);
    }

    private java.io.File crashFile() {
        return new java.io.File(getFilesDir(), "crash.txt");
    }

    private void writeCrash(String text) {
        try (java.io.FileWriter w = new java.io.FileWriter(crashFile(), true)) {
            w.write(new java.util.Date() + "\n" + text + "\n\n");
        } catch (Exception ignored) {
        }
    }

    /** Saves the reason for a crash so the next start can show it instead of just closing. */
    private void installCrashRecorder() {
        final Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            writeCrash(android.util.Log.getStackTraceString(error));
            // A crash while the page is up most often means it was too heavy: use the light look next time.
            prefs().edit().putBoolean("lite", true).apply();
            if (previous != null) previous.uncaughtException(thread, error);
        });
    }

    /** Poll the local server, then show the app. The first start copies files and can take a few seconds. */
    private void waitForServer() {
        new Thread(() -> {
            for (int i = 0; i < 180; i++) {
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
                java.io.File errorFile = BuildConfigInfo.errorFile(this);
                if (errorFile.exists()) {
                    String reason = readFile(errorFile);
                    runOnUiThread(() -> showError(reason));
                    return;
                }
                if (i > 40 && !nodeProcessAlive()) {
                    runOnUiThread(() -> showError("The server process stopped unexpectedly."));
                    return;
                }
                try {
                    Thread.sleep(250);
                } catch (InterruptedException e) {
                    return;
                }
            }
            runOnUiThread(() -> showError("The Marquee server did not answer within 45 seconds."));
        }).start();
    }

    /** Start the server process. A plain start from the foreground avoids Android's 5-second foreground rule. */
    private void startServer() {
        try {
            startService(new Intent(this, NodeService.class));
        } catch (Throwable t) {
            android.util.Log.e("Marquee", "Could not start the server process", t);
        }
    }

    private boolean nodeProcessAlive() {
        return nodePid() != -1;
    }

    private int nodePid() {
        android.app.ActivityManager am = (android.app.ActivityManager) getSystemService(ACTIVITY_SERVICE);
        java.util.List<android.app.ActivityManager.RunningAppProcessInfo> list = am.getRunningAppProcesses();
        if (list != null) {
            for (android.app.ActivityManager.RunningAppProcessInfo p : list) {
                if (p.processName.endsWith(":node")) return p.pid;
            }
        }
        return -1;
    }

    private static String readFile(java.io.File f) {
        try (java.io.InputStream in = new java.io.FileInputStream(f)) {
            return new String(in.readAllBytes()).trim();
        } catch (Exception e) {
            return "";
        }
    }

    /** The app's own recent log lines (Android lets an app read its own log). */
    private static String recentLog() {
        try {
            java.lang.Process p = Runtime.getRuntime().exec(new String[] {"logcat", "-d", "-t", "400", "-v", "brief"});
            String all = new String(p.getInputStream().readAllBytes());
            StringBuilder out = new StringBuilder();
            // Everything this app logged (Android only shows an app its own lines), minus loader noise.
            for (String line : all.split("\n")) {
                if (!line.contains("nativeloader")) out.append(line).append('\n');
            }
            String text = out.toString();
            return text.length() > 12000 ? text.substring(text.length() - 12000) : text;
        } catch (Exception e) {
            return "(log unavailable: " + e + ")";
        }
    }

    private void showError(String reason) {
        String details = "Marquee " + BuildConfigInfo.version(this) + " on " + Build.MANUFACTURER + " " + Build.MODEL
            + ", Android " + Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + "), ABIs " + String.join(",", Build.SUPPORTED_ABIS)
            + "\n\n" + reason
            + "\n\nStartup steps:\n" + readFile(new java.io.File(getFilesDir(), "data/startup.log"))
            + "\n\n" + recentLog();

        android.widget.LinearLayout box = new android.widget.LinearLayout(this);
        box.setOrientation(android.widget.LinearLayout.VERTICAL);
        box.setPadding(48, 96, 48, 48);
        TextView title = new TextView(this);
        title.setText("Marquee could not start");
        title.setTextColor(Color.rgb(243, 241, 236));
        title.setTextSize(22);
        TextView body = new TextView(this);
        body.setText(details);
        body.setTextColor(Color.rgb(176, 173, 166));
        body.setTextSize(12);
        body.setTypeface(android.graphics.Typeface.MONOSPACE);
        body.setTextIsSelectable(true);
        android.widget.Button copy = new android.widget.Button(this);
        copy.setText("Copy details");
        copy.setOnClickListener(v -> {
            android.content.ClipboardManager cm = (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
            cm.setPrimaryClip(android.content.ClipData.newPlainText("Marquee", details));
            Toast.makeText(this, "Copied", Toast.LENGTH_SHORT).show();
        });
        android.widget.Button retry = new android.widget.Button(this);
        retry.setText("Try again");
        retry.setOnClickListener(v -> {
            int pid = nodePid();
            if (pid != -1) android.os.Process.killProcess(pid);
            //noinspection ResultOfMethodCallIgnored
            BuildConfigInfo.errorFile(this).delete();
            recreate();
        });
        android.widget.ScrollView scroll = new android.widget.ScrollView(this);
        box.addView(title);
        box.addView(copy);
        box.addView(retry);
        box.addView(body);
        scroll.addView(box);
        root.removeAllViews();
        root.addView(scroll);
    }

    private void setFullscreenUi(boolean on) {
        int flags = on
            ? View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            : View.SYSTEM_UI_FLAG_VISIBLE;
        getWindow().getDecorView().setSystemUiVisibility(flags);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        // Back from the keys page: reload so the sign-in screen moves on to the phone number.
        if (requestCode == 41 && web != null) web.reload();
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
        public boolean isLite() {
            return prefs().getBoolean("lite", false);
        }

        /** Switches the lighter look (no blur effects) on or off and restarts the screen. */
        @JavascriptInterface
        public void setLite(boolean on) {
            prefs().edit().putBoolean("lite", on).apply();
            runOnUiThread(() -> recreate());
        }

        /** Opens Telegram's developer page once so the app can pick up its own Telegram keys. */
        @JavascriptInterface
        public void setupKeys() {
            runOnUiThread(() -> startActivityForResult(new Intent(MainActivity.this, KeysActivity.class), 41));
        }

        /** Plays a library file in the built-in native player. Progress is saved to the local server. */
        @JavascriptInterface
        public void playNative(String url, String title, double startSeconds, int fileId, int profileId) {
            runOnUiThread(() -> {
                Intent intent = new Intent(MainActivity.this, PlayerActivity.class);
                intent.putExtra("url", url);
                intent.putExtra("title", title);
                intent.putExtra("startMs", (long) (startSeconds * 1000));
                intent.putExtra("fileId", fileId);
                intent.putExtra("profileId", profileId);
                startActivity(intent);
            });
        }

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
