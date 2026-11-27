package app.marquee;

import android.content.Context;
import android.content.res.AssetManager;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/** Starts the bundled Marquee server on Node.js (nodejs-mobile). Node can start once per process. */
public final class NodeRuntime {
    public static final int PORT = 38787;
    private static final String TAG = "Marquee";
    private static boolean started;

    static {
        System.loadLibrary("node");
        System.loadLibrary("native-lib");
    }

    private NodeRuntime() {}

    private static native int startNode(String[] arguments);

    public static synchronized void ensureStarted(Context context) {
        if (started) return;
        started = true;
        final Context app = context.getApplicationContext();
        // Node and V8 need a far bigger stack than Android gives a thread by default.
        Thread thread = new Thread(null, () -> {
            try {
                File project = prepareProject(app);
                File data = new File(app.getFilesDir(), "data");
                //noinspection ResultOfMethodCallIgnored
                data.mkdirs();
                int code = startNode(new String[] {
                    "node",
                    new File(project, "main.mjs").getAbsolutePath(),
                    data.getAbsolutePath(),
                    new File(project, "web").getAbsolutePath(),
                    String.valueOf(PORT),
                });
                Log.e(TAG, "Node exited with code " + code);
            } catch (Exception e) {
                Log.e(TAG, "Could not start Node", e);
            }
        }, "marquee-node", 16L * 1024 * 1024);
        thread.start();
    }

    /** Node needs real files: copy the server out of the APK whenever the app was installed or updated. */
    private static File prepareProject(Context context) throws Exception {
        File dir = new File(context.getFilesDir(), "nodejs-project");
        File marker = new File(dir, ".installed");
        long installed = context.getPackageManager().getPackageInfo(context.getPackageName(), 0).lastUpdateTime;
        String stamp = String.valueOf(installed);
        if (marker.exists() && stamp.equals(read(marker))) return dir;
        deleteRecursive(dir);
        copyAssets(context.getAssets(), "nodejs-project", dir);
        try (OutputStream out = new FileOutputStream(marker)) {
            out.write(stamp.getBytes());
        }
        return dir;
    }

    private static void copyAssets(AssetManager assets, String path, File target) throws IOException {
        String[] children = assets.list(path);
        if (children == null || children.length == 0) {
            //noinspection ResultOfMethodCallIgnored
            target.getParentFile().mkdirs();
            try (InputStream in = assets.open(path); OutputStream out = new FileOutputStream(target)) {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            }
            return;
        }
        //noinspection ResultOfMethodCallIgnored
        target.mkdirs();
        for (String child : children) copyAssets(assets, path + "/" + child, new File(target, child));
    }

    private static String read(File file) {
        try (InputStream in = new java.io.FileInputStream(file)) {
            return new String(in.readAllBytes()).trim();
        } catch (IOException e) {
            return "";
        }
    }

    private static void deleteRecursive(File file) {
        File[] children = file.listFiles();
        if (children != null) for (File c : children) deleteRecursive(c);
        //noinspection ResultOfMethodCallIgnored
        file.delete();
    }
}
