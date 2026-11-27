package app.marquee;

import android.content.Context;

/** Shared by the UI process and the server process. Never loads Node, so the UI cannot crash with it. */
final class BuildConfigInfo {
    static final int PORT = 38787;

    private BuildConfigInfo() {}

    /** Node runs in its own process; failures are written here so the screen can show them. */
    static java.io.File errorFile(Context context) {
        return new java.io.File(context.getFilesDir(), "node-error.txt");
    }

    static String version(Context context) {
        try {
            return context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "?";
        }
    }
}
