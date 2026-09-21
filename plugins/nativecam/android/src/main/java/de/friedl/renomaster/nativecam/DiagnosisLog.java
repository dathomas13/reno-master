package de.friedl.renomaster.nativecam;

import android.content.Context;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.charset.Charset;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * A log that survives the phone restarting under it.
 *
 * The camera protocol in platform/cameraLog.ts writes to localStorage, which looks synchronous
 * and is not: the WebView buffers and hands over to storage later. An app crash still gets
 * flushed by the system - which is what that protocol was built for - but the full camera
 * check took the whole phone down, and every line of it was gone afterwards. Nothing could be
 * learned from the one run that mattered most.
 *
 * So this writes to a plain file and calls fsync on every line. That is slow, and for a few
 * hundred lines of diagnosis it does not matter in the slightest; what matters is that when
 * the line says "about to open camera 2" and the phone dies, that sentence is on the disk
 * rather than in somebody's buffer.
 *
 * The other half of the trick is in the caller: write what is about to happen before doing it,
 * not after. See CameraDiagnosis.
 */
final class DiagnosisLog {

    private static final String FILE_NAME = "kamera-pruefbericht.log";
    private static final Charset UTF8 = Charset.forName("UTF-8");
    /** enough for several runs; older lines go when a new run starts anyway */
    private static final long MAX_BYTES = 512 * 1024;

    private final File file;
    private final SimpleDateFormat clock = new SimpleDateFormat("HH:mm:ss.SSS", Locale.GERMANY);

    DiagnosisLog(Context context) {
        this.file = new File(context.getFilesDir(), FILE_NAME);
    }

    /** one line, on the disk before this method returns */
    void line(String text) {
        try (FileOutputStream out = new FileOutputStream(file, true)) {
            out.write((clock.format(new Date()) + " " + text + "\n").getBytes(UTF8));
            out.flush();
            // the whole point: without this the line sits in a buffer the reboot throws away
            out.getFD().sync();
        } catch (IOException ignored) {
            // a diagnosis that cannot write is still better than one that crashes here
        }
    }

    List<String> read() {
        List<String> lines = new ArrayList<>();
        if (!file.exists()) return lines;
        try (RandomAccessFile input = new RandomAccessFile(file, "r")) {
            long skip = Math.max(0, input.length() - MAX_BYTES);
            input.seek(skip);
            String line;
            while ((line = input.readLine()) != null) {
                // RandomAccessFile#readLine reads bytes, so the umlauts have to be put back
                lines.add(new String(line.getBytes(Charset.forName("ISO-8859-1")), UTF8));
            }
        } catch (IOException ignored) {
            // an unreadable report reads as empty
        }
        return lines;
    }

    void clear() {
        // deliberately not deleted: an empty file that exists is one less thing to go wrong
        try (FileOutputStream out = new FileOutputStream(file, false)) {
            out.flush();
            out.getFD().sync();
        } catch (IOException ignored) {
            // nothing to be done about it
        }
    }
}
