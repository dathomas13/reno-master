package de.friedl.renomaster.fileexport;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Writes the export into a folder the user picks.
 *
 * The diary carries the originals of a few hundred photos. Packing them into a zip would
 * mean holding the archive somewhere, and the phone has no room for a second copy of
 * everything. Written as single files there is no second copy at all: each picture is
 * copied from the gallery straight into the target folder and is never seen by the app
 * itself - a 12 megapixel photo never crosses the bridge into JavaScript.
 *
 * The folder comes from the system picker, so it can sit on the internal storage, on an
 * SD card or in a folder some cloud app keeps in sync. Access to it is persisted, which
 * means a later export can write into the same folder without asking again.
 */
@CapacitorPlugin(name = "FileExport")
public class FileExportPlugin extends Plugin {

    private static final int BUFFER = 64 * 1024;
    private static final String DEFAULT_MIME = "application/octet-stream";

    /**
     * Folders already created during this export.
     *
     * DocumentFile.findFile lists the whole directory for every lookup, so without this
     * an export of five hundred photos into thirty day folders would walk those
     * directories five hundred times.
     */
    private final Map<String, DocumentFile> folders = new HashMap<>();

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
        );
        startActivityForResult(call, intent, "folderPicked");
    }

    @ActivityCallback
    private void folderPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject answer = new JSObject();
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            answer.put("cancelled", true);
            call.resolve(answer);
            return;
        }
        Uri tree = data.getData();
        try {
            // without this the permission dies with the app; with it the same folder can
            // be written again next month
            getContext()
                .getContentResolver()
                .takePersistableUriPermission(
                    tree,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                );
        } catch (SecurityException ignored) {
            // some providers do not offer it; the export still works for this run
        }
        folders.clear();
        answer.put("uri", tree.toString());
        answer.put("label", labelOf(tree));
        call.resolve(answer);
    }

    /** a readable name for the chosen folder, for the confirmation in the app */
    private String labelOf(Uri tree) {
        DocumentFile root = DocumentFile.fromTreeUri(getContext(), tree);
        String name = root == null ? null : root.getName();
        if (name != null) return name;
        String path = tree.getLastPathSegment();
        return path == null ? tree.toString() : path;
    }

    /** true when the app may still write into that folder */
    @PluginMethod
    public void canWrite(PluginCall call) {
        String tree = call.getString("treeUri");
        JSObject answer = new JSObject();
        if (tree == null) {
            answer.put("granted", false);
            call.resolve(answer);
            return;
        }
        DocumentFile root = DocumentFile.fromTreeUri(getContext(), Uri.parse(tree));
        answer.put("granted", root != null && root.canWrite());
        call.resolve(answer);
    }

    /**
     * Writes one file, either copied from a content:// source or from the bytes handed
     * over. Missing folders along the path are created.
     */
    @PluginMethod
    public void writeFile(PluginCall call) {
        String tree = call.getString("treeUri");
        String path = call.getString("path");
        if (tree == null || path == null || path.isEmpty()) {
            call.reject("treeUri und path werden gebraucht");
            return;
        }
        String sourceUri = call.getString("sourceUri");
        String base64 = call.getString("base64");
        if (sourceUri == null && base64 == null) {
            call.reject("Weder Quelle noch Inhalt angegeben");
            return;
        }
        String mime = call.getString("mime", DEFAULT_MIME);

        new Thread(() -> {
            try {
                DocumentFile root = DocumentFile.fromTreeUri(getContext(), Uri.parse(tree));
                if (root == null || !root.canWrite()) {
                    call.reject("Der Zielordner ist nicht mehr beschreibbar");
                    return;
                }
                long written = write(root, path, sourceUri, base64, mime);
                JSObject answer = new JSObject();
                answer.put("bytes", written);
                call.resolve(answer);
            } catch (Exception error) {
                String message = error.getMessage();
                call.reject(message == null ? "Schreiben fehlgeschlagen" : message, error);
            }
        }, "reno-export").start();
    }

    private long write(DocumentFile root, String path, String sourceUri, String base64, String mime)
        throws Exception {
        String[] parts = path.split("/");
        String name = parts[parts.length - 1];
        DocumentFile folder = root;
        StringBuilder walked = new StringBuilder(root.getUri().toString());
        for (int i = 0; i < parts.length - 1; i++) {
            walked.append('/').append(parts[i]);
            folder = folderIn(folder, parts[i], walked.toString());
        }

        DocumentFile existing = folder.findFile(name);
        // an overwrite has to remove the old entry first, otherwise the provider makes
        // "bild (1).jpg" and the folder fills up with duplicates
        if (existing != null && !existing.delete()) {
            throw new IllegalStateException("Vorhandene Datei lässt sich nicht ersetzen: " + name);
        }
        DocumentFile target = folder.createFile(mime, name);
        if (target == null) throw new IllegalStateException("Datei lässt sich nicht anlegen: " + name);

        ContentResolver resolver = getContext().getContentResolver();
        long written = 0;
        try (OutputStream output = resolver.openOutputStream(target.getUri())) {
            if (output == null) throw new IllegalStateException("Kein Schreibzugriff auf " + name);
            if (sourceUri != null) {
                try (InputStream input = resolver.openInputStream(Uri.parse(sourceUri))) {
                    if (input == null) throw new IllegalStateException("Quelle nicht lesbar");
                    byte[] buffer = new byte[BUFFER];
                    int read;
                    while ((read = input.read(buffer)) != -1) {
                        output.write(buffer, 0, read);
                        written += read;
                    }
                }
            } else {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                output.write(bytes);
                written = bytes.length;
            }
            output.flush();
        }
        return written;
    }

    private DocumentFile folderIn(DocumentFile parent, String name, String key) {
        DocumentFile cached = folders.get(key);
        if (cached != null) return cached;
        DocumentFile existing = parent.findFile(name);
        DocumentFile folder = existing != null && existing.isDirectory() ? existing : parent.createDirectory(name);
        if (folder == null) throw new IllegalStateException("Ordner lässt sich nicht anlegen: " + name);
        folders.put(key, folder);
        return folder;
    }

    /** reads a small file back, used for the index of an earlier export */
    @PluginMethod
    public void readFile(PluginCall call) {
        String tree = call.getString("treeUri");
        String path = call.getString("path");
        if (tree == null || path == null) {
            call.reject("treeUri und path werden gebraucht");
            return;
        }
        new Thread(() -> {
            JSObject answer = new JSObject();
            try {
                DocumentFile root = DocumentFile.fromTreeUri(getContext(), Uri.parse(tree));
                DocumentFile file = root;
                for (String part : path.split("/")) {
                    if (file == null) break;
                    file = file.findFile(part);
                }
                if (file == null || !file.isFile()) {
                    answer.put("missing", true);
                    call.resolve(answer);
                    return;
                }
                try (InputStream input = getContext().getContentResolver().openInputStream(file.getUri())) {
                    if (input == null) {
                        answer.put("missing", true);
                        call.resolve(answer);
                        return;
                    }
                    java.io.ByteArrayOutputStream collected = new java.io.ByteArrayOutputStream();
                    byte[] buffer = new byte[BUFFER];
                    int read;
                    while ((read = input.read(buffer)) != -1) collected.write(buffer, 0, read);
                    answer.put("base64", Base64.encodeToString(collected.toByteArray(), Base64.NO_WRAP));
                    call.resolve(answer);
                }
            } catch (Exception error) {
                answer.put("missing", true);
                call.resolve(answer);
            }
        }, "reno-export-read").start();
    }
}
