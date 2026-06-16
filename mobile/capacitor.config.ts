import type { CapacitorConfig } from '@capacitor/cli';

// The native shell is a thin WebView wrapper around the live Pacific Drone site.
// Nothing is bundled — `server.url` points the WebView at the deployed Next.js app.
//
// Override the target for local/staging testing without editing this file:
//   CAP_SERVER_URL="http://192.168.1.50:3000" npm run sync
// (use your machine's LAN IP so a device/simulator can reach `next dev`).
const serverUrl = process.env.CAP_SERVER_URL || 'https://pacificdrone.ca';

const config: CapacitorConfig = {
  appId: 'ca.pacificdrone.app',
  appName: 'Pacific Drone',
  // Required by Capacitor even with a remote server.url; holds the offline fallback.
  webDir: 'www',
  // Appended to the WebView User-Agent so the server can tell the app from a browser.
  // MUST stay in sync with NATIVE_UA_MARKER in src/lib/platform.ts — it drives
  // reader-mode hiding of purchase UI and the Google/Apple sign-in buttons.
  appendUserAgentString: 'RPASApp',
  server: {
    url: serverUrl,
    // Allow plain HTTP only when pointing at a local/staging dev server (never prod).
    cleartext: serverUrl.startsWith('http://'),
    // First-party navigations stay in the WebView; other origins open externally.
    allowNavigation: ['pacificdrone.ca', '*.pacificdrone.ca'],
  },
  ios: {
    // Let the page's safe-area CSS (env(safe-area-inset-*)) own the insets.
    contentInset: 'never',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#FBFBF9',
      showSpinner: false,
    },
  },
};

export default config;
