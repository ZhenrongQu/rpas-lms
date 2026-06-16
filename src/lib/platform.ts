/**
 * Marker appended to the WebView User-Agent by the native (Capacitor) shell
 * (see `mobile/capacitor.config.ts` → `server.appendUserAgentString`).
 * Keep the two in sync — it's how the server tells the app apart from a browser.
 *
 * Pure module (no Next imports) so route handlers that use it stay unit-testable.
 * For React Server Components, use `isNativeRequest` from `./platform.server`.
 */
export const NATIVE_UA_MARKER = 'RPASApp';

/** True when a User-Agent string belongs to our native app shell. */
export function isNativeUA(ua: string | null | undefined): boolean {
  return typeof ua === 'string' && ua.includes(NATIVE_UA_MARKER);
}
