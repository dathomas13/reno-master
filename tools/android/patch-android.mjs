/**
 * Applies our own settings to the generated Android project.
 *
 * Capacitor generates android/ from a template; everything project specific goes in here
 * so it survives a regeneration. The script is idempotent: running it twice changes
 * nothing.
 *
 *   node tools/android/patch-android.mjs
 *
 * Two values come from the environment, because they change with every build:
 *   RENO_VERSION_CODE  integer, must grow for Android to accept an update (CI run number)
 *   RENO_VERSION_NAME  what the user sees, e.g. "1.0.14 (06904d6)"
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(process.cwd(), 'android');
if (!fs.existsSync(root)) {
  console.error('android/ fehlt - zuerst "npx cap add android" ausführen');
  process.exit(1);
}

const changes = [];

/** replaces a file in the generated project with one of ours, if the template has it */
function replaceFile(file, source, note) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) return false;
  const wanted = fs.readFileSync(source);
  if (fs.readFileSync(full).equals(wanted)) return true;
  fs.writeFileSync(full, wanted);
  changes.push(`${file}: ${note}`);
  return true;
}

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
  // lets the app install its own next version; Android still asks the user
  '<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />',
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

// ---------------------------------------------------------------- launcher icon
// Capacitor ships its own placeholder icon. Ours is generated from tools/icon/icon.svg
// (see tools/icon/build-icons.mjs) and committed, so the build only copies it.
const DENSITIES = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
const ICON_SOURCE = path.join(process.cwd(), 'tools/icon/android');

let iconsFound = 0;
for (const density of DENSITIES) {
  for (const name of ['ic_launcher', 'ic_launcher_round', 'ic_launcher_foreground']) {
    const source = path.join(ICON_SOURCE, `${name}-${density}.png`);
    if (!fs.existsSync(source)) continue;
    if (replaceFile(`app/src/main/res/mipmap-${density}/${name}.png`, source, 'App-Icon ersetzt')) {
      iconsFound += 1;
    }
  }
}
if (iconsFound === 0) {
  console.error('Kein einziges Launcher-Icon gefunden - hat Capacitor die Pfade geändert?');
  process.exit(1);
}

// the adaptive icon shows this colour behind our drawing
edit(
  'app/src/main/res/values/ic_launcher_background.xml',
  (xml) => xml.replace(/>#[0-9a-fA-F]{6,8}</, '>#1d2126<'),
  'Icon-Hintergrund auf das App-Dunkel gesetzt',
);

// ---------------------------------------------------------------- version
// Android only installs an APK over an existing one when versionCode is at least as high
// as the installed one, so the build number becomes the version code.
const versionCode = process.env.RENO_VERSION_CODE;
const versionName = process.env.RENO_VERSION_NAME;
if (versionCode || versionName) {
  edit(
    'app/build.gradle',
    (gradle) => {
      let out = gradle;
      if (versionCode) out = out.replace(/versionCode\s+\d+/, `versionCode ${Number(versionCode)}`);
      if (versionName) out = out.replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`);
      return out;
    },
    `Version gesetzt (${versionCode ?? '-'} / ${versionName ?? '-'})`,
  );
}

// ---------------------------------------------------------------- release signing
// Without a fixed key every CI run signs with a different throwaway debug key and Android
// refuses to install the new APK over the old one. If android/keystore.properties exists
// (the workflow writes it from the repository secrets), the release build uses it; if it
// does not, nothing changes and the debug key stays in charge.
const SIGNING_MARKER = 'renoKeystoreFile';

const SIGNING_HEAD = `
// Release-Signatur: android/keystore.properties und android/keystore.jks legt der
// Workflow aus den GitHub-Secrets an. Fehlen sie, bleibt es beim Debug-Schlüssel.
def ${SIGNING_MARKER} = rootProject.file("keystore.properties")
def renoKeystore = new Properties()
if (${SIGNING_MARKER}.exists()) {
    ${SIGNING_MARKER}.withInputStream { renoKeystore.load(it) }
}
`;

const SIGNING_CONFIG = `    signingConfigs {
        release {
            if (${SIGNING_MARKER}.exists()) {
                storeFile rootProject.file(renoKeystore.getProperty('storeFile'))
                storePassword renoKeystore.getProperty('storePassword')
                keyAlias renoKeystore.getProperty('keyAlias')
                keyPassword renoKeystore.getProperty('keyPassword')
            }
        }
    }
`;

edit(
  'app/build.gradle',
  (gradle) => {
    if (gradle.includes(SIGNING_MARKER)) return gradle;
    let out = gradle;

    // 1. the properties file, read once at the top of the script
    const applyLine = /^apply plugin: ['"]com\.android\.application['"].*$/m;
    if (!applyLine.test(out)) throw new Error('app/build.gradle sieht anders aus als erwartet');
    out = out.replace(applyLine, (match) => `${match}\n${SIGNING_HEAD}`);

    // 2. the signing config itself, right before the build types that use it
    const buildTypes = /^(\s*)buildTypes \{/m;
    if (!buildTypes.test(out)) throw new Error('buildTypes fehlt in app/build.gradle');
    out = out.replace(buildTypes, (match) => `${SIGNING_CONFIG}${match}`);

    // 3. use it for the release build - but only when the key is actually there
    const releaseType = /(buildTypes \{[^]*?\n(\s*)release \{)/;
    if (!releaseType.test(out)) throw new Error('buildTypes.release fehlt in app/build.gradle');
    out = out.replace(
      releaseType,
      (match, whole, indent) =>
        `${whole}\n${indent}    if (${SIGNING_MARKER}.exists()) {\n` +
        `${indent}        signingConfig signingConfigs.release\n` +
        `${indent}    }`,
    );
    return out;
  },
  'Release-Signatur vorbereitet',
);

if (changes.length === 0) {
  console.log('nichts zu ändern, das Projekt ist schon angepasst');
} else {
  for (const change of changes) console.log('  ' + change);
}
