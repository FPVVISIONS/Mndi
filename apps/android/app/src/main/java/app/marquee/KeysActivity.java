package app.marquee;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * One-time Telegram setup. Telegram only hands out the ID and key an app needs through its
 * developer website, so this opens that page in a real browser view. The person signs in there with
 * their number and the code Telegram sends, and this screen then reads the keys off the page (or
 * fills in and submits the "create app" form) and gives them to the local server.
 */
public class KeysActivity extends Activity {
    private static final String BASE = "http://127.0.0.1:" + BuildConfigInfo.PORT;
    private String script = "";
    private int rounds;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private WebView web;
    private boolean done;
    private final Runnable poll = new Runnable() {
        @Override
        public void run() {
            if (done) return;
            rounds++;
            web.evaluateJavascript(script, value -> {
                if (value == null || done) return;
                java.util.regex.Matcher m = java.util.regex.Pattern
                    .compile("\"id\":\"(\\d+)\",\"hash\":\"([a-f0-9]{32})\"").matcher(value);
                if (m.find()) {
                    done = true;
                    save(m.group(1), m.group(2));
                } else if (value.contains("needHash") && rounds % 8 == 0) {
                    Toast.makeText(KeysActivity.this, "Tap the eye icon next to api_hash", Toast.LENGTH_LONG).show();
                }
            });
            handler.postDelayed(this, 1200);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(5, 5, 6));

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(false);
        CookieManager.getInstance().setAcceptCookie(true);
        web.setWebViewClient(new WebViewClient());

        TextView note = new TextView(this);
        note.setText("Sign in here with your Telegram number. Marquee takes care of the rest.");
        note.setTextColor(Color.rgb(200, 200, 205));
        note.setTextSize(13);
        note.setPadding(32, 24, 32, 24);
        note.setBackgroundColor(Color.rgb(20, 20, 24));

        android.widget.LinearLayout col = new android.widget.LinearLayout(this);
        col.setOrientation(android.widget.LinearLayout.VERTICAL);
        col.addView(note, new android.widget.LinearLayout.LayoutParams(
            android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
            android.widget.LinearLayout.LayoutParams.WRAP_CONTENT));
        col.addView(web, new android.widget.LinearLayout.LayoutParams(
            android.widget.LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
        root.addView(col);
        setContentView(root);

        try (java.io.InputStream in = getAssets().open("keys.js")) {
            script = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (Exception e) {
            Toast.makeText(this, "Setup script missing", Toast.LENGTH_LONG).show();
        }
        web.loadUrl("https://my.telegram.org/apps");
        handler.postDelayed(poll, 2000);
    }

    /** Hands the keys to the local server, then returns to the app. */
    private void save(final String id, final String hash) {
        Toast.makeText(this, "Telegram is set up", Toast.LENGTH_SHORT).show();
        new Thread(() -> {
            boolean ok = false;
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(BASE + "/api/auth/credentials").openConnection();
                c.setRequestMethod("POST");
                c.setConnectTimeout(4000);
                c.setReadTimeout(8000);
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json");
                String body = "{\"apiId\":" + id + ",\"apiHash\":\"" + hash + "\"}";
                try (OutputStream out = c.getOutputStream()) {
                    out.write(body.getBytes(StandardCharsets.UTF_8));
                }
                ok = c.getResponseCode() == 200;
                c.disconnect();
            } catch (Exception ignored) {
                // Falls through to the failure message.
            }
            final boolean saved = ok;
            runOnUiThread(() -> {
                if (!saved) {
                    done = false;
                    Toast.makeText(this, "Could not save the keys. Try again.", Toast.LENGTH_LONG).show();
                    return;
                }
                setResult(RESULT_OK);
                finish();
            });
        }).start();
    }

    @Override
    protected void onDestroy() {
        done = true;
        handler.removeCallbacks(poll);
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
