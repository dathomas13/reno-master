/** Which build is running. Injected by Vite, see the `define` block in vite.config.ts. */
export const APP_VERSION = __APP_VERSION__;
/** counts up with every commit; the only thing an update check may compare */
export const APP_BUILD = __APP_BUILD__;
export const APP_SHA = __APP_SHA__;
export const BUILD_DATE = __BUILD_DATE__;
