# Android TWA (Trusted Web Activity) Setup

This guide packages the existing Scopa AI PWA into an Android app using a Trusted Web Activity (TWA). It assumes the web app is already deployed to a stable HTTPS URL.

## 1) Prerequisites

- **Stable HTTPS origin** for the PWA (e.g. `https://scopa-ai.vovchenko.net`).
- **Android Studio** installed (for SDK + keystore tooling).
- **JDK 17+** available on your machine.
- **Node.js 18+** for the Bubblewrap CLI.

## 2) Verify PWA installability

Run a Lighthouse PWA audit on the deployed site (Chrome DevTools → Lighthouse → PWA). Confirm:

- Manifest loads without errors.
- Service worker is active.
- App starts in standalone mode.
- Icons are valid and available.

If you change the manifest or service worker, redeploy before proceeding.

## 3) Install Bubblewrap

Bubblewrap generates an Android project for TWA.

```bash
npm install -g @bubblewrap/cli
```

Verify:

```bash
bubblewrap --version
```

## 4) Initialize the TWA project

Run `bubblewrap init` using your production URL:

```bash
bubblewrap init --manifest=https://YOUR_DOMAIN/manifest.json
```

During prompts:

- **Application ID**: `net.vovchenko.scopaai` (or your preferred reverse‑DNS).
- **App name**: `Scopa AI`.
- **Launcher name**: `Scopa AI`.
- **Icon URL**: should auto‑detect from manifest.

This creates an Android project in the current directory.

## 5) Generate a signing key

Google Play requires a release key. Create one if you don’t already have it:

```bash
keytool -genkey -v -keystore scopa-ai-release.keystore \
  -alias scopa-ai \
  -keyalg RSA -keysize 2048 -validity 10000
```

Store this keystore securely; you’ll need it for updates.

## 6) Configure Digital Asset Links

TWA requires a `/.well-known/assetlinks.json` file on your web domain.

1. Get your app’s signing certificate fingerprint after build or from your keystore:

```bash
keytool -list -v -keystore scopa-ai-release.keystore -alias scopa-ai
```

2. Create `assetlinks.json`:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "net.vovchenko.scopaai",
      "sha256_cert_fingerprints": [
        "YOUR_SHA256_FINGERPRINT"
      ]
    }
  }
]
```

3. Deploy to:

```
https://YOUR_DOMAIN/.well-known/assetlinks.json
```

Validate via:

```
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://YOUR_DOMAIN&relation=delegate_permission/common.handle_all_urls
```

## 7) Build the Android app

From the Bubblewrap project directory:

```bash
bubblewrap build
```

This produces an APK/AAB in the `app/build/outputs/` folder.

For Play Store uploads, you’ll need an **AAB**. Bubblewrap will prompt if not configured.

## 8) Test locally on a device

Enable developer mode and install the APK:

```bash
adb install app/build/outputs/apk/release/app-release.apk
```

Launch the app and verify:

- It opens directly to your PWA.
- The address bar is hidden (trusted mode).
- Offline CPU mode still works (service worker cache).

## 9) Prepare Play Store release

In Google Play Console:

1. Create a new app.
2. Upload the AAB.
3. Complete **Data Safety** and **Privacy Policy**.
4. Add screenshots, description, and feature graphic.

## 10) Ongoing updates

- Updates to the PWA do **not** require new Play Store releases, unless you change:
  - the manifest scope/start URL,
  - the Digital Asset Links config,
  - or the Android wrapper itself.
- If you update the app ID or signing key, you must update `assetlinks.json`.

---

## Notes specific to Scopa AI

- The PWA already includes a manifest and service worker, so it meets the TWA baseline.
- Offline support is for CPU play only; LLM opponents require network access.
- Multiplayer requires a stable WebSocket backend.

