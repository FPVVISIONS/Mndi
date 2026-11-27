package app.marquee;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.Process;

/**
 * Keeps the app process (and the Node server in it) alive in the background, so the library keeps
 * updating and an external player such as VLC can keep streaming from it.
 */
public class NodeService extends Service {
    static final String ACTION_QUIT = "app.marquee.QUIT";
    private static final String CHANNEL = "marquee";

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_QUIT.equals(intent.getAction())) {
            stopForeground(true);
            stopSelf();
            Process.killProcess(Process.myPid());
            return START_NOT_STICKY;
        }
        try {
            Notification notification = buildNotification();
            if (Build.VERSION.SDK_INT >= 29) {
                startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(1, notification);
            }
        } catch (Throwable t) {
            // Some phones refuse background services; the server still runs while the app is open.
            android.util.Log.e("Marquee", "Foreground service refused", t);
        }
        NodeRuntime.ensureStarted(this);
        return START_STICKY;
    }

    private Notification buildNotification() {
        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Marquee", NotificationManager.IMPORTANCE_MIN));
            builder = new Notification.Builder(this, CHANNEL);
        } else {
            builder = new Notification.Builder(this);
        }
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), flags);
        PendingIntent quit = PendingIntent.getService(this, 1, new Intent(this, NodeService.class).setAction(ACTION_QUIT), flags);
        return builder
            .setSmallIcon(R.drawable.ic_mark)
            .setContentTitle("Marquee")
            .setContentText("Running in the background")
            .setContentIntent(open)
            .setOngoing(true)
            .addAction(new Notification.Action.Builder(null, "Quit", quit).build())
            .build();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
