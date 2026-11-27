package app.marquee;

import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.WindowManager;
import android.widget.Toast;

import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Full-screen native player. Unlike the web view it plays MKV smoothly, seeks with the bar, and
 * decodes AC3, E-AC3, DTS and TrueHD audio through FFmpeg when the phone has no decoder for them.
 */
public class PlayerActivity extends Activity {
    private static final String BASE = "http://127.0.0.1:" + BuildConfigInfo.PORT;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private ExoPlayer player;
    private PlayerView view;
    private int fileId;
    private int profileId;
    private final Runnable saver = new Runnable() {
        @Override
        public void run() {
            saveProgress();
            handler.postDelayed(this, 10_000);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);

        String url = getIntent().getStringExtra("url");
        long startMs = getIntent().getLongExtra("startMs", 0);
        fileId = getIntent().getIntExtra("fileId", 0);
        profileId = getIntent().getIntExtra("profileId", 0);
        if (url == null) {
            finish();
            return;
        }

        view = new PlayerView(this);
        view.setBackgroundColor(Color.BLACK);
        view.setShowSubtitleButton(true);
        view.setKeepScreenOn(true);
        setContentView(view);
        hideSystemBars();

        // Software FFmpeg decoders are used for any audio the phone's own decoders cannot play.
        DefaultRenderersFactory factory = new DefaultRenderersFactory(this)
            .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON)
            .setEnableDecoderFallback(true);
        player = new ExoPlayer.Builder(this, factory).build();
        player.setAudioAttributes(androidx.media3.common.AudioAttributes.DEFAULT, true);
        player.addListener(new Player.Listener() {
            @Override
            public void onPlayerError(PlaybackException error) {
                Toast.makeText(PlayerActivity.this, "Can't play this file: " + error.getErrorCodeName(), Toast.LENGTH_LONG).show();
            }

            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_ENDED) {
                    saveProgress();
                    finish();
                }
            }
        });
        view.setPlayer(player);
        player.setMediaItem(MediaItem.fromUri(url));
        if (startMs > 5_000) player.seekTo(startMs);
        player.prepare();
        player.play();
    }

    private void hideSystemBars() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    protected void onStart() {
        super.onStart();
        handler.postDelayed(saver, 10_000);
    }

    @Override
    protected void onStop() {
        super.onStop();
        handler.removeCallbacks(saver);
        saveProgress();
        if (player != null) player.pause();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(saver);
        if (player != null) {
            player.release();
            player = null;
        }
        super.onDestroy();
    }

    /** Tells the local server where playback is, so Continue watching and resume work. */
    private void saveProgress() {
        if (player == null || fileId == 0) return;
        final long position = player.getCurrentPosition();
        final long duration = player.getDuration();
        if (position < 5_000 || duration <= 0) return;
        final String body = "{\"fileId\":" + fileId + ",\"position\":" + (position / 1000.0)
            + ",\"duration\":" + (duration / 1000.0) + "}";
        new Thread(() -> {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(BASE + "/api/progress").openConnection();
                c.setRequestMethod("POST");
                c.setConnectTimeout(3000);
                c.setReadTimeout(3000);
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json");
                if (profileId > 0) c.setRequestProperty("x-profile", String.valueOf(profileId));
                try (OutputStream out = c.getOutputStream()) {
                    out.write(body.getBytes(StandardCharsets.UTF_8));
                }
                c.getResponseCode();
                c.disconnect();
            } catch (Exception ignored) {
                // Progress is best effort.
            }
        }).start();
    }
}
