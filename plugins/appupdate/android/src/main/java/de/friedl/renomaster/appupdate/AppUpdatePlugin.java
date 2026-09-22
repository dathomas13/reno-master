package de.friedl.renomaster.appupdate;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Installs a new version of the app over the running one.
 *
 * An app that was side loaded cannot replace itself silently - only the device owner may
 * do that - but it can do everything up to the last step: fetch the APK itself, show its
 * own progress, and hand the file to Android's package installer, which asks the user
 * once. That is the difference between "here is a link" and an update inside the app.
 *
 * The install itself goes through PackageInstaller.Session, not a plain "open this file"
 * intent. The reason is a single flag: Session.setRequestDowngrade(true). Android refuses
 * to put an older APK over a newer one - always, for the plain file-open path, no matter
 * who signed it - unless the installed app is debuggable, in which case the flag is
 * honoured even for a normal, unprivileged app like this one. Every build this project
 * ships without the release secrets is a debug build, so this is the one path that can
 * actually move to an older version without the user deinstalling first.
 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

    private static final String TAG = "RenoAppUpdate";
    private static final String FOLDER = "updates";
    private static final String FILE_NAME = "reno-master.apk";
    private static final String APK_TYPE = "application/vnd.android.package-archive";
    private static final int BUFFER = 64 * 1024;
    /** a redirect chain longer than this is a loop, not a download */
    private static final int MAX_REDIRECTS = 5;
    private static final String INSTALL_ACTION = "de.friedl.renomaster.appupdate.INSTALL_RESULT";

    private final BroadcastReceiver installReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            handleInstallResult(context, intent);
        }
    };

    @Override
    public void load() {
        IntentFilter filter = new IntentFilter(INSTALL_ACTION);
        // only this app sends it (via its own PendingIntent), never another process
        ContextCompat.registerReceiver(getContext(), installReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    @Override
    protected void handleOnDestroy() {
        try {
            getContext().unregisterReceiver(installReceiver);
        } catch (IllegalArgumentException alreadyGone) {
            // load() may not have run yet, or this already happened - either way, fine
        }
    }

    /** true when the user has allowed this app to install packages */
    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", mayInstall());
        call.resolve(result);
    }

    private boolean mayInstall() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
        return getContext().getPackageManager().canRequestPackageInstalls();
    }

    /** opens the system page where that permission is granted */
    @PluginMethod
    public void openSourceSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.resolve();
            return;
        }
        Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)
            .setData(Uri.parse("package:" + getContext().getPackageName()))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    /**
     * Downloads the APK and starts the installer. Progress is reported as "progress"
     * events with loaded/total in bytes; the call resolves once the session is committed
     * and Android has taken over - not once the install itself has finished, since that
     * needs a confirmation only the user can give.
     */
    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("Keine Adresse für die neue Fassung angegeben");
            return;
        }
        if (!url.startsWith("https://")) {
            call.reject("Nur https ist erlaubt");
            return;
        }

        new Thread(() -> {
            try {
                File apk = download(url);
                install(apk);
                JSObject result = new JSObject();
                result.put("path", apk.getAbsolutePath());
                call.resolve(result);
            } catch (Exception error) {
                String message = error.getMessage();
                call.reject(message == null ? "Das Update ließ sich nicht laden" : message, error);
            }
        }, "reno-update").start();
    }

    private File download(String url) throws Exception {
        File base = getContext().getExternalFilesDir(null);
        if (base == null) {
            throw new IllegalStateException("Der Speicher des Geräts ist gerade nicht erreichbar");
        }
        File folder = new File(base, FOLDER);
        if (!folder.exists() && !folder.mkdirs()) {
            throw new IllegalStateException("Kein Platz für die neue Fassung auf dem Gerät");
        }
        File target = new File(folder, FILE_NAME);
        // a half finished file from an earlier attempt would be installed as is
        File partial = new File(folder, FILE_NAME + ".part");
        if (partial.exists() && !partial.delete()) {
            throw new IllegalStateException("Ein alter Download lässt sich nicht löschen");
        }

        HttpURLConnection connection = open(url);
        try {
            int status = connection.getResponseCode();
            if (status != HttpURLConnection.HTTP_OK) {
                throw new IllegalStateException("Der Server antwortete mit " + status);
            }
            long total = connection.getContentLength(); // int is plenty for an APK
            long loaded = 0;
            byte[] buffer = new byte[BUFFER];
            try (InputStream input = connection.getInputStream();
                 FileOutputStream output = new FileOutputStream(partial)) {
                int read;
                long lastReport = 0;
                while ((read = input.read(buffer)) != -1) {
                    output.write(buffer, 0, read);
                    loaded += read;
                    // one event per 100 KB is enough for a smooth bar and keeps the
                    // bridge quiet
                    if (loaded - lastReport >= 100 * 1024 || loaded == total) {
                        lastReport = loaded;
                        report(loaded, total);
                    }
                }
                output.getFD().sync();
            }
            if (total > 0 && loaded != total) {
                throw new IllegalStateException("Der Download brach ab, bitte erneut versuchen");
            }
        } finally {
            connection.disconnect();
        }

        if (target.exists() && !target.delete()) {
            throw new IllegalStateException("Die vorige Datei lässt sich nicht ersetzen");
        }
        if (!partial.renameTo(target)) {
            throw new IllegalStateException("Die Datei lässt sich nicht ablegen");
        }
        return target;
    }

    /**
     * HttpURLConnection does not follow a redirect that switches host on its own in every
     * case, and release downloads always redirect, so the hops are walked here.
     */
    private HttpURLConnection open(String url) throws Exception {
        String current = url;
        for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
            HttpURLConnection connection = (HttpURLConnection) new URL(current).openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(30_000);
            connection.setReadTimeout(60_000);
            connection.setRequestProperty("Accept", APK_TYPE + ",application/octet-stream,*/*");
            int status = connection.getResponseCode();
            boolean redirect = status == HttpURLConnection.HTTP_MOVED_PERM
                || status == HttpURLConnection.HTTP_MOVED_TEMP
                || status == HttpURLConnection.HTTP_SEE_OTHER
                || status == 307
                || status == 308;
            if (!redirect) return connection;
            String next = connection.getHeaderField("Location");
            connection.disconnect();
            if (next == null) throw new IllegalStateException("Umleitung ohne Ziel");
            current = new URL(new URL(current), next).toString();
            if (!current.startsWith("https://")) {
                throw new IllegalStateException("Umleitung auf eine unsichere Adresse");
            }
        }
        throw new IllegalStateException("Zu viele Umleitungen");
    }

    private void report(long loaded, long total) {
        JSObject event = new JSObject();
        event.put("loaded", loaded);
        event.put("total", total);
        notifyListeners("progress", event);
    }

    /**
     * Hands the APK to Android's PackageInstaller as a session instead of a plain
     * ACTION_VIEW file intent. Functionally the same system dialog appears at the end for
     * a normal update - the only difference this buys is setRequestDowngrade(true), which
     * a file-open intent has no equivalent for and which the plain path never honours
     * regardless of this flag.
     */
    private void install(File apk) throws Exception {
        Context context = getContext();
        PackageInstaller installer = context.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params =
            new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            // only effective when the currently installed app is itself debuggable - true
            // for every build this project ships without the release signing secrets
            params.setRequestDowngrade(true);
        }

        int sessionId = installer.createSession(params);
        PackageInstaller.Session session = installer.openSession(sessionId);
        try {
            try (InputStream input = new FileInputStream(apk);
                 OutputStream output = session.openWrite(FILE_NAME, 0, apk.length())) {
                byte[] buffer = new byte[BUFFER];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    output.write(buffer, 0, read);
                }
                session.fsync(output);
            }

            Intent statusIntent = new Intent(INSTALL_ACTION).setPackage(context.getPackageName());
            int flags = PendingIntent.FLAG_UPDATE_CURRENT
                | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0);
            PendingIntent pendingIntent = PendingIntent.getBroadcast(context, sessionId, statusIntent, flags);
            session.commit(pendingIntent.getIntentSender());
        } catch (Exception error) {
            session.abandon();
            throw error;
        } finally {
            session.close();
        }
    }

    /**
     * A fresh side load always needs the user's confirmation - Android reports that as
     * STATUS_PENDING_USER_ACTION with the dialog to show, not as an error. Everything else
     * is a real failure and only reaches the debug log: downloadAndInstall() has already
     * resolved by the time this arrives, so there is no pending promise left to reject.
     */
    private void handleInstallResult(Context context, Intent intent) {
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm == null) return;
            confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            Activity activity = getActivity();
            if (activity != null) {
                activity.startActivity(confirm);
            } else {
                context.startActivity(confirm);
            }
            return;
        }
        if (status != PackageInstaller.STATUS_SUCCESS) {
            String message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
            Log.w(TAG, "Installation nicht abgeschlossen (Status " + status + "): " + message);
        }
    }
}
