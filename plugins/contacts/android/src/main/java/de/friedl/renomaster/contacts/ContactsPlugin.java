package de.friedl.renomaster.contacts;

import android.Manifest;
import android.content.ContentResolver;
import android.database.Cursor;
import android.net.Uri;
import android.provider.ContactsContract;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Reads the device's own address book for the contact-import review list.
 *
 * The Contact Picker API (`navigator.contacts`) that the web build uses does not work
 * inside this app's WebView: Chromium reports it as present and even answers
 * `getProperties()`, but `select()` always rejects with "Unable to open a contact
 * selector" - the WebView has no Activity to host the picker dialog the way a normal
 * Chrome tab does. Android also has no reliable multi-select contact picker Intent to fall
 * back to, so this reads the address book directly instead (like MediaStorePlugin reads
 * the gallery) and hands the whole list to the same review screen the vCard import already
 * uses - nobody has to pick contacts one at a time through a system dialog.
 */
@CapacitorPlugin(
    name = "Contacts",
    permissions = {
        @Permission(alias = ContactsPlugin.READ, strings = { Manifest.permission.READ_CONTACTS })
    }
)
public class ContactsPlugin extends Plugin {

    public static final String READ = "read";
    private static final int DEFAULT_LIMIT = 1000;

    @PluginMethod
    public void hasPermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", getPermissionState(READ) == PermissionState.GRANTED);
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        requestPermissionForAlias(READ, call, "permissionCallback");
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        boolean granted = getPermissionState(READ) == PermissionState.GRANTED;
        if ("listContacts".equals(call.getMethodName())) {
            if (!granted) {
                call.reject("Ohne Zugriff auf die Kontakte kann das Adressbuch nicht gelesen werden.");
                return;
            }
            listContacts(call);
            return;
        }
        JSObject result = new JSObject();
        result.put("granted", granted);
        call.resolve(result);
    }

    @PluginMethod
    public void listContacts(PluginCall call) {
        if (getPermissionState(READ) != PermissionState.GRANTED) {
            requestPermissionForAlias(READ, call, "permissionCallback");
            return;
        }

        int limit = call.getInt("limit", DEFAULT_LIMIT);
        ContentResolver resolver = getContext().getContentResolver();

        // the base list, in the order the phone's own contacts app shows it
        Map<String, String> names = new LinkedHashMap<>();
        String[] contactColumns = { ContactsContract.Contacts._ID, ContactsContract.Contacts.DISPLAY_NAME };
        try (Cursor cursor = resolver.query(
            ContactsContract.Contacts.CONTENT_URI, contactColumns, null, null,
            ContactsContract.Contacts.DISPLAY_NAME + " ASC"
        )) {
            if (cursor == null) {
                call.reject("Das Adressbuch konnte nicht gelesen werden.");
                return;
            }
            int idColumn = cursor.getColumnIndexOrThrow(ContactsContract.Contacts._ID);
            int nameColumn = cursor.getColumnIndexOrThrow(ContactsContract.Contacts.DISPLAY_NAME);
            while (cursor.moveToNext() && names.size() < limit) {
                String name = cursor.getString(nameColumn);
                if (name == null || name.trim().isEmpty()) continue;
                names.put(cursor.getString(idColumn), name.trim());
            }
        } catch (Exception error) {
            call.reject("Das Adressbuch konnte nicht gelesen werden.", error);
            return;
        }

        // phone and email have their own dedicated content URI, one row per value - the
        // first of each is enough here, the review list is not a full contact card
        Map<String, String> phones = firstValuePerContact(
            resolver,
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
            ContactsContract.CommonDataKinds.Phone.NUMBER,
            null, null
        );
        Map<String, String> emails = firstValuePerContact(
            resolver,
            ContactsContract.CommonDataKinds.Email.CONTENT_URI,
            ContactsContract.CommonDataKinds.Email.CONTACT_ID,
            ContactsContract.CommonDataKinds.Email.ADDRESS,
            null, null
        );
        // Organization has no CONTENT_URI of its own - it is just another mimetype row in
        // the generic Data table, so it needs the mimetype filter the other two get built in
        Map<String, String> companies = firstValuePerContact(
            resolver,
            ContactsContract.Data.CONTENT_URI,
            ContactsContract.CommonDataKinds.Organization.CONTACT_ID,
            ContactsContract.CommonDataKinds.Organization.COMPANY,
            ContactsContract.Data.MIMETYPE + " = ?",
            new String[] { ContactsContract.CommonDataKinds.Organization.CONTENT_ITEM_TYPE }
        );

        JSArray contacts = new JSArray();
        for (Map.Entry<String, String> entry : names.entrySet()) {
            String id = entry.getKey();
            JSObject contact = new JSObject();
            contact.put("name", entry.getValue());
            putIfPresent(contact, "phone", phones.get(id));
            putIfPresent(contact, "email", emails.get(id));
            putIfPresent(contact, "company", companies.get(id));
            contacts.put(contact);
        }

        JSObject result = new JSObject();
        result.put("contacts", contacts);
        call.resolve(result);
    }

    private void putIfPresent(JSObject target, String key, String value) {
        if (value != null && !value.trim().isEmpty()) {
            target.put(key, value.trim());
        }
    }

    /** the first value of a contacts data table per contact id, e.g. the first phone number */
    private Map<String, String> firstValuePerContact(
        ContentResolver resolver, Uri uri, String idColumnName, String valueColumnName,
        String selection, String[] selectionArgs
    ) {
        Map<String, String> result = new HashMap<>();
        String[] columns = { idColumnName, valueColumnName };
        try (Cursor cursor = resolver.query(uri, columns, selection, selectionArgs, null)) {
            if (cursor == null) return result;
            int idColumn = cursor.getColumnIndexOrThrow(idColumnName);
            int valueColumn = cursor.getColumnIndexOrThrow(valueColumnName);
            while (cursor.moveToNext()) {
                String id = cursor.getString(idColumn);
                if (result.containsKey(id)) continue;
                String value = cursor.getString(valueColumn);
                if (value != null && !value.trim().isEmpty()) {
                    result.put(id, value.trim());
                }
            }
        } catch (Exception error) {
            // a table that cannot be read (e.g. no organization data at all on this
            // device) just means that field stays empty for everyone - not worth failing
            // the whole import over
        }
        return result;
    }
}
