package de.friedl.renomaster.appupdate;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
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
 * The file goes into the app's own external files directory and is handed over through a
 * FileProvider, because since Android 7 a file:// URI to another process is refused.
 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

    private static final String FOLDER = "updates";
    private static final String FILE_NAME = "reno-master.apk";
    private static final String APK_TYPE = "application/vnd.android.package-archive";
    private static final int BUFFER = 64 * 1024;
    /** a redirect chain longer than this is a loop, not a download */
    private static final int MAX_REDIRECTS = 5;

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
     * events with loaded/total in bytes; the call resolves once the installer is up.
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

    private void install(File apk) {
        Context context = getContext();
        Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".updateprovider", apk);
        Intent intent = new Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, APK_TYPE)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        Activity activity = getActivity();
        if (activity != null) {
            activity.startActivity(intent);
        } else {
            context.startActivity(intent);
        }
    }
}
