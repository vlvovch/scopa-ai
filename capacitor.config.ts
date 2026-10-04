import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor shell for the iOS app. The web app is bundled locally
 * (webDir = the `vite build --mode ios` output); nothing is loaded from a
 * remote server.url, so both games, their bots, cards and sounds work
 * offline from the first launch.
 *
 * Bundle id: override with CAP_APP_ID at `cap sync` time for another
 * distribution identity (the value is baked into ios/App by `cap sync`;
 * signing team / profiles live in Xcode → Signing & Capabilities, see
 * docs/ios.md).
 */
const config: CapacitorConfig = {
  appId: process.env.CAP_APP_ID ?? 'net.vvlabs.scopa',
  appName: 'Scopa AI',
  webDir: 'dist-ios',
  ios: {
    // Web content extends edge to edge; the app pads with the CSS
    // safe-area insets (index.css `html.native`).
    contentInset: 'never',
    backgroundColor: '#1B5E20',
    allowsLinkPreview: false,
  },
  plugins: {
    SplashScreen: {
      // Hidden by src/platform/bootstrap.ts once the first frame rendered,
      // so the launch image never gives way to a blank page.
      launchAutoHide: false,
      backgroundColor: '#1B5E20',
      showSpinner: false,
    },
    Keyboard: {
      // The web view shrinks above the keyboard so focused inputs
      // (nickname, join code, API keys) stay visible.
      resize: 'native',
    },
  },
};

export default config;
