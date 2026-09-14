package de.friedl.renomaster.appupdate;

import androidx.core.content.FileProvider;

/**
 * The same FileProvider, under its own name.
 *
 * Capacitor already declares androidx.core.content.FileProvider in the app manifest, and
 * the manifest merger matches providers by class, not by authority: a second declaration
 * of the same class is a conflict. Subclassing gives this one its own identity, so both
 * providers live side by side - Capacitor's for the camera, this one for the update file.
 */
public class UpdateFileProvider extends FileProvider {
}
