/**
 * Applies our own settings to the generated Android project.
 *
 * Capacitor generates android/ from a template; everything project specific goes in here
 * so it survives a regeneration. The script is idempotent: running it twice changes
 * nothing.
 *
 *   node tools/android/patch-android.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(process.cwd(), 'android');
if (!fs.existsSync(root)) {
  console.error('android/ fehlt - zuerst "npx cap add android" ausführen');
  process.exit(1);
}

const changes = [];

function edit(file, change, note) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) {
    console.log(`  übersprungen (nicht vorhanden): ${file}`);
    return;
  }
  const before = fs.readFileSync(full, 'utf8');
  const after = change(before);
  if (after !== before) {
    fs.writeFileSync(full, after);
    changes.push(`${file}: ${note}`);
  }
}

// ---------------------------------------------------------------- permissions
// READ_MEDIA_IMAGES is what the gallery picker needs on Android 13+, the older
// READ_EXTERNAL_STORAGE covers Android 12 and below. POST_NOTIFICATIONS is required
// from Android 13 on for the evening reminder.
const PERMISSIONS = [
  '<uses-permission android:name="android.permission.INTERNET" />',
  '<uses-permission android:name="android.permission.CAMERA" />',
  '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
  '<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />',
  '<uses-permission\n        android:name="android.permission.READ_EXTERNAL_STORAGE"\n        android:maxSdkVersion="32" />',
];

edit(
  'app/src/main/AndroidManifest.xml',
  (xml) => {
    let out = xml;
    for (const permission of PERMISSIONS) {
      const name = /android:name="([^"]+)"/.exec(permission)?.[1];
      if (name && out.includes(name)) continue;
      out = out.replace('</manifest>', `    ${permission}\n</manifest>`);
    }
    return out;
  },
  'Berechtigungen ergänzt',
);

// ---------------------------------------------------------------- app name
edit(
  'app/src/main/res/values/strings.xml',
  (xml) =>
    xml
      .replace(/<string name="app_name">[^<]*<\/string>/, '<string name="app_name">Reno Master</string>')
      .replace(/<string name="title_activity_main">[^<]*<\/string>/, '<string name="title_activity_main">Reno Master</string>'),
  'App-Name gesetzt',
);

// ---------------------------------------------------------------- dark background
// the web app paints its own dark UI; a white window flashes on every cold start
edit(
  'app/src/main/res/values/styles.xml',
  (xml) =>
    xml.includes('colorBackground')
      ? xml
      : xml.replace(
          /<style name="AppTheme.NoActionBar"[^>]*>/,
          (match) =>
            `${match}\n        <item name="android:colorBackground">#1d2126</item>` +
            '\n        <item name="android:windowBackground">#1d2126</item>',
        ),
  'dunkler Fensterhintergrund',
);

if (changes.length === 0) {
  console.log('nichts zu ändern, das Projekt ist schon angepasst');
} else {
  for (const change of changes) console.log('  ' + change);
}
