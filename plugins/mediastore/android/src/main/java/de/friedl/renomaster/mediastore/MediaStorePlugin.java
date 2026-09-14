package de.friedl.renomaster.mediastore;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Size;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

/**
 * Reads the device gallery by day.
 *
 * The construction diary asks for the photos of the day an entry is about. A file picker
 * cannot do that: it hands over copies and says nothing about when a picture was taken.
 * This plugin queries MediaStore instead, returns the content:// URI of the original and
 * only ever hands the app a downsized copy, so nothing is stored twice.
 */
@CapacitorPlugin(
    name = "MediaStore",
    permissions = {
        @Permission(alias = MediaStorePlugin.PHOTOS, strings = { Manifest.permission.READ_MEDIA_IMAGES }),
        @Permission(alias = MediaStorePlugin.STORAGE, strings = { Manifest.permission.READ_EXTERNAL_STORAGE })
    }
)
public class MediaStorePlugin extends Plugin {

    public static final String PHOTOS = "photos";
    public static final String STORAGE = "storage";

    private static final int DEFAULT_LIMIT = 300;
    private static final int DEFAULT_MAX_EDGE = 1600;
    private static final int JPEG_QUALITY = 82;

    /** Android 13 split the media permissions; below that the old storage one applies */
    private String readAlias() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ? PHOTOS : STORAGE;
    }

    private boolean ensurePermission(PluginCall call) {
        String alias = readAlias();
        if (getPermissionState(alias) == PermissionState.GRANTED) {
            return true;
        }
        requestPermissionForAlias(alias, call, "permissionCallback");
        return false;
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        if (getPermissionState(readAlias()) != PermissionState.GRANTED) {
            call.reject("Ohne Zugriff auf die Fotos kann die Galerie nicht gelesen werden.");
            return;
        }
        switch (call.getMethodName()) {
            case "listPhotos":
                listPhotos(call);
                break;
            case "getThumbnail":
                getThumbnail(call);
                break;
            case "readImage":
                readImage(call);
                break;
            default:
                call.reject("Unbekannte Methode: " + call.getMethodName());
        }
    }

    /** start of the given local day, in milliseconds */
    private long startOfDay(String isoDate) throws Exception {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd", Locale.GERMANY);
        Date parsed = format.parse(isoDate);
        if (parsed == null) {
            throw new IllegalArgumentException("Datum nicht lesbar: " + isoDate);
        }
        Calendar calendar = Calendar.getInstance();
        calendar.setTime(parsed);
        calendar.set(Calendar.HOUR_OF_DAY, 0);
        calendar.set(Calendar.MINUTE, 0);
        calendar.set(Calendar.SECOND, 0);
        calendar.set(Calendar.MILLISECOND, 0);
        return calendar.getTimeInMillis();
    }

    private String isoDateTime(long millis) {
        return new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.GERMANY).format(new Date(millis));
    }

    @PluginMethod
    public void listPhotos(PluginCall call) {
        if (!ensurePermission(call)) {
            return;
        }
        String from = call.getString("from");
        String to = call.getString("to", from);
        if (from == null) {
            call.reject("from fehlt (Format YYYY-MM-DD)");
            return;
        }
        int limit = call.getInt("limit", DEFAULT_LIMIT);

        long start;
        long end;
        try {
            start = startOfDay(from);
            end = startOfDay(to) + 24L * 60 * 60 * 1000 - 1;
        } catch (Exception error) {
            call.reject("Datum nicht lesbar", error);
            return;
        }

        String[] columns = {
            MediaStore.Images.Media._ID,
            MediaStore.Images.Media.DISPLAY_NAME,
            MediaStore.Images.Media.DATE_TAKEN,
            MediaStore.Images.Media.DATE_ADDED,
            MediaStore.Images.Media.SIZE,
            MediaStore.Images.Media.WIDTH,
            MediaStore.Images.Media.HEIGHT
        };
        // DATE_TAKEN is milliseconds and empty on screenshots, DATE_ADDED is seconds and
        // always there, so both are compared
        String selection =
            "(" + MediaStore.Images.Media.DATE_TAKEN + " BETWEEN ? AND ?)" +
            " OR (" + MediaStore.Images.Media.DATE_TAKEN + " IS NULL AND " +
            MediaStore.Images.Media.DATE_ADDED + " BETWEEN ? AND ?)";
        String[] arguments = {
            String.valueOf(start), String.valueOf(end),
            String.valueOf(start / 1000), String.valueOf(end / 1000)
        };
        String order = MediaStore.Images.Media.DATE_TAKEN + " DESC, " +
            MediaStore.Images.Media.DATE_ADDED + " DESC";

        JSArray photos = new JSArray();
        ContentResolver resolver = getContext().getContentResolver();
        try (
            Cursor cursor = resolver.query(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI, columns, selection, arguments, order
            )
        ) {
            if (cursor == null) {
                call.reject("Die Galerie konnte nicht gelesen werden.");
                return;
            }
            int idColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID);
            int nameColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME);
            int takenColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_TAKEN);
            int addedColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED);
            int sizeColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.SIZE);
            int widthColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.WIDTH);
            int heightColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.HEIGHT);

            while (cursor.moveToNext() && photos.length() < limit) {
                long id = cursor.getLong(idColumn);
                long taken = cursor.getLong(takenColumn);
                if (taken <= 0) {
                    taken = cursor.getLong(addedColumn) * 1000L;
                }
                JSObject photo = new JSObject();
                photo.put("uri", ContentUris.withAppendedId(
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id).toString());
                photo.put("name", cursor.getString(nameColumn));
                photo.put("takenAt", isoDateTime(taken));
                photo.put("bytes", cursor.getLong(sizeColumn));
                photo.put("width", cursor.getInt(widthColumn));
                photo.put("height", cursor.getInt(heightColumn));
                photos.put(photo);
            }
        } catch (Exception error) {
            call.reject("Die Galerie konnte nicht gelesen werden.", error);
            return;
        }

        JSObject result = new JSObject();
        result.put("photos", photos);
        call.resolve(result);
    }

    @PluginMethod
    public void getThumbnail(PluginCall call) {
        if (!ensurePermission(call)) {
            return;
        }
        String uri = call.getString("uri");
        if (uri == null) {
            call.reject("uri fehlt");
            return;
        }
        int size = call.getInt("size", 320);
        try {
            Bitmap bitmap;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                bitmap = getContext().getContentResolver()
                    .loadThumbnail(Uri.parse(uri), new Size(size, size), null);
            } else {
                bitmap = decodeScaled(Uri.parse(uri), size);
            }
            call.resolve(asJpeg(bitmap, 70));
        } catch (Exception error) {
            call.reject("Vorschaubild nicht verfügbar", error);
        }
    }

    @PluginMethod
    public void readImage(PluginCall call) {
        if (!ensurePermission(call)) {
            return;
        }
        String uri = call.getString("uri");
        if (uri == null) {
            call.reject("uri fehlt");
            return;
        }
        int maxEdge = call.getInt("maxEdge", DEFAULT_MAX_EDGE);
        try {
            call.resolve(asJpeg(decodeScaled(Uri.parse(uri), maxEdge), JPEG_QUALITY));
        } catch (Exception error) {
            call.reject("Bild konnte nicht gelesen werden", error);
        }
    }

    @PluginMethod
    public void openInGallery(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null) {
            call.reject("uri fehlt");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(Uri.parse(uri), "image/*");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("Die Galerie konnte nicht geöffnet werden", error);
        }
    }

    /** decodes at roughly the wanted size, so a 12 megapixel photo never hits memory in full */
    private Bitmap decodeScaled(Uri uri, int maxEdge) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();

        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (InputStream stream = resolver.openInputStream(uri)) {
            BitmapFactory.decodeStream(stream, null, bounds);
        }

        int longest = Math.max(bounds.outWidth, bounds.outHeight);
        int sample = 1;
        while (longest / sample > maxEdge * 2) {
            sample *= 2;
        }

        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = sample;
        Bitmap decoded;
        try (InputStream stream = resolver.openInputStream(uri)) {
            decoded = BitmapFactory.decodeStream(stream, null, options);
        }
        if (decoded == null) {
            throw new IllegalStateException("Bild konnte nicht dekodiert werden");
        }

        int width = decoded.getWidth();
        int height = decoded.getHeight();
        int edge = Math.max(width, height);
        if (edge <= maxEdge) {
            return decoded;
        }
        float scale = (float) maxEdge / edge;
        Bitmap scaled = Bitmap.createScaledBitmap(
            decoded, Math.round(width * scale), Math.round(height * scale), true);
        if (scaled != decoded) {
            decoded.recycle();
        }
        return scaled;
    }

    private JSObject asJpeg(Bitmap bitmap, int quality) {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        bitmap.compress(Bitmap.CompressFormat.JPEG, quality, buffer);
        JSObject result = new JSObject();
        result.put("base64", Base64.encodeToString(buffer.toByteArray(), Base64.NO_WRAP));
        result.put("mime", "image/jpeg");
        result.put("width", bitmap.getWidth());
        result.put("height", bitmap.getHeight());
        bitmap.recycle();
        return result;
    }
}
