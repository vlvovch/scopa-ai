# iOS app (Capacitor)

The iOS app is the same React/TypeScript web app packaged with
[Capacitor 8](https://capacitorjs.com) as a native shell. Both games, their
CPU/Esperto bots, every card deck and sound are bundled inside the app, so
Scopa and Briscola play offline from the first launch, including switching
between them. Nothing is loaded from the website at runtime; the packaged
bundle is the `vite build --mode ios` output (`dist-ios/`).

Status: **release candidate**. Runs in the iOS Simulator with ad-hoc
signing; `npm run ios:release` produces the App Store build signed by the
paid team (verified 2026-09-15); submission follows `docs/app-store.md`.

## Prerequisites

- macOS with **Xcode 26** (tested with 26.6) and its iOS platform. If the
  Simulator runtime is missing, install it with
  `xcodebuild -downloadPlatform iOS` (or Xcode → Settings → Components).
- Node 22+ (`.nvmrc`-free; 23.x tested) and the repo's `npm install`.
- Swift Package Manager only (no CocoaPods); Xcode resolves the packages on
  first build (network access needed once, for `capacitor-swift-pm`).
- Optional, for the Claude Code Simulator integration: select Xcode once
  with `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`.

## Build and run

```bash
npm run build:ios      # web bundle for the app → dist-ios/  (mode "ios", .env.ios)
npm run ios:sync       # build:ios + `cap sync ios` (copies dist-ios into ios/App/App/public, updates Package.swift)
npm run ios:open       # open ios/App/App.xcodeproj in Xcode, pick a simulator, ⌘R
npm run ios:run        # ios:sync + `cap run ios` (interactive simulator picker; `--target "<name>"` to skip it)
npm run ios:build      # headless: xcodebuild for the Simulator SDK → ios/build/…/Debug-iphonesimulator/App.app
npm run ios:install    # install + launch the headless build on the booted simulator, with the JS console on stdout
```

Typical loop after editing web code: `npm run ios:sync`, then run from Xcode
(or `npm run ios:build && npm run ios:install`). Native code (Swift, Info.plist,
assets) lives in `ios/App` and is edited in Xcode.

The JS console is mirrored to the Xcode console and to `ios:install`'s
stdout (`⚡️ [log] …`). Safari → Develop → Simulator also attaches the Web
Inspector to the running web view.

## What is native, what is web

| Piece | Where |
|---|---|
| Native mode flag | `.env.ios` → `VITE_NATIVE=true`; `src/platform/native.ts` (`IS_NATIVE_BUILD`, build-time) |
| Capacitor config | `capacitor.config.ts` (`appId`, `webDir: dist-ios`, splash, keyboard) |
| Start-up | `src/main.tsx` → `src/platform/bootstrap.ts` (hydrate storage, cold-launch link, listeners, status bar, splash) |
| Storage | `src/platform/storage.ts` (facade) + `src/platform/nativeStores.ts` (Preferences, Filesystem, Keychain) |
| Keychain plugin | `ios/App/App/SecureStoragePlugin.swift`, registered by `ios/App/App/MainViewController.swift` (created in `SceneDelegate.swift`) |
| Other local plugins | `BuildInfoPlugin.swift` (build facts for the analytics gate, the app's language), `AppleIntelligencePlugin.swift`, `KeepAwakePlugin.swift`, `ReviewPlugin.swift` (rating prompt), all registered in `MainViewController.swift` and listed in `project.pbxproj` |
| Invitation links | `src/platform/links.ts` (public game domains, incoming URL parsing) |
| Website-only HTML | `<!-- @web-only:start/end -->` blocks in `index.html`, stripped by `vite.config.ts` for the native build |
| Safe areas | `--safe-top` / `--safe-bottom` on `html.native` (`src/index.css`) |

Everything in `src/platform/` is reached from the website bundles only
through `IS_NATIVE_BUILD` branches (dead-code-eliminated) and dynamic
imports, so `npm run build` / `build:briscola` / `build:itch` contain no
Capacitor code — verified by grepping the built assets.

### Native runtime behaviour

- **No service worker, no web update flow.** The website's registration,
  update/reload and PWA install counter are inside the
  `@web-only` fences and never reach the app (analytics has no tag in
  the HTML at all: `src/analytics/gate.ts` decides at runtime); `sw.js` is not shipped in
  `dist-ios`. The app updates through the store.
- **Assets, lazy chunks, workers, routes.** Everything is served from
  `capacitor://localhost` by Capacitor's asset handler, which resolves
  extension-less paths (`/briscola`, `/join/CODE`) to `index.html`, so the
  existing router and the lazily loaded other-game chunk work unchanged.
- **Safe areas / sizing.** `viewport-fit=cover` plus the `--safe-top` /
  `--safe-bottom` variables keep the game layout, start screens and the fixed
  corner controls out of the status bar and home indicator. Tap highlight and
  long-press callouts are disabled in the app.
- **Keyboard.** `Keyboard.resize = native` shrinks the web view above the
  keyboard; tapping outside an input blurs it and hides the keyboard.
- **Audio / background.** Returning to the foreground fires the web view's
  `visibilitychange` and a synthetic `focus`, which the sound hook
  (AudioContext resume) and the multiplayer hooks (socket probe) already
  handle. The game-switch cancellation and audio-cleanup fixes are unchanged.

## Storage

The app keeps the exact keys and JSON shapes the website uses, but persists
them natively (web storage inside the web view is not used for app data):

| Data | Keys | Native store |
|---|---|---|
| Settings (without API keys), language, remembered game, chooser/notice markers, multiplayer sessions, nickname, spectator picks | `scopa-settings`, `scopa-language`, `selected-game`, `other-game-announced`, `scopa-mp-session`, `briscola-mp-session`, `mp-nickname`, `scopa-spectator-*`, `review-prompt` | **Preferences** (UserDefaults, group `ScopaAI`) |
| Game history / stats and the saved solo game | `scopa-game-stats`, `briscola-game-stats`, `scopa-game-state` | **Filesystem**, `Library/scopa-data/<key>.json` (backed up, not user-visible) |
| User-supplied LLM API keys | fields of `scopa-settings` | **Keychain** (`SecureStorage` plugin), split out on write and merged back on read |

Hydration happens once in `bootstrapNative()` before React renders; consumers
then read and write synchronously through the facade, writes are queued per
key (ordered, last write wins), and a write before hydration is refused and
logged so a startup default can never overwrite saved data. Persistence was
verified across termination and relaunch in the Simulator (a remembered
game selection stored in Preferences reopens Briscola directly).

**Missing is not the same as unreadable.** Every backend resolves `null`
when nothing is saved and rejects when a saved value could not be read
(the Filesystem store only reads files it has just listed, so a rejection
there is never "no such file"). A key whose read rejected during hydration
is *degraded* for the session: the app sees no value and keeps whatever it
writes in memory only, and nothing is persisted for that key, so the
startup defaults that follow (empty history, empty API key, no saved game)
cannot overwrite what is still on disk. If a whole backend fails to list
its keys, every key of that backend is degraded; a keychain field that
fails to read is skipped on every later settings write while the rest of
the settings save normally. Failures are logged once with the affected
keys (`[storage] …`), `NativeStorage.degraded` / `isDegraded(key)` expose
them, and recovery is simply the next launch, when hydration runs again.
Tests: `src/platform/storage.test.ts`, `src/platform/nativeStores.test.ts`.

**Safari website stats are separate from the app's data.** The website
stores everything in the browser's storage for playscopa.net; the app has
its own native stores. Transferring history from the website into the app
is outside this first implementation.

## Networking, multiplayer, AI

`.env.ios` sets the production backends explicitly:

```
VITE_WS_URL=wss://playscopa.net/ws
VITE_BRISCOLA_WS_URL=wss://playbriscola.com/ws
VITE_PROXY_URL=https://playscopa.net
```

- **Multiplayer** connects to those WebSocket servers directly; they apply no
  origin check, so no backend change is needed.
- **Free AI (proxy).** Requests come from the app's origin
  `capacitor://localhost`. The proxy's CORS allow-list (`ALLOWED_ORIGIN` in
  the `scopa-proxy` systemd unit, **comma-separated** — the proxy splits on
  commas) includes `capacitor://localhost` since 2026-09-15, next to the
  four public domains, so the free Gemini opponent works in the app. BYOK providers (Gemini, OpenAI, OpenRouter,
  Claude) are called directly and already accept browser origins.
- **Offline.** CPU play needs no network; LLM opponents and multiplayer do.
- Nothing from a developer's `.env.local` reaches the bundle: `.env.ios`
  defines every value the app uses, with empty API keys (BYOK only).

## Invitations and deep links

- Share links from inside the app point at each game's public domain
  (`https://playscopa.net/join/SCOPA-…`, `https://playbriscola.com/join/BRISCOLA-…`),
  never at the app's local origin.
- Incoming links are handled on **cold launch** (`App.getLaunchUrl`, folded
  into the page path before the first render so the invite wins over the
  remembered game and skips the chooser) and **while running**
  (`appUrlOpen` → the game on screen honours it: immediately when idle,
  after the leave-game confirmation during a match, in a waiting room or
  while reconnecting, and by handing over to the other game when the code
  belongs to it).
- The app registers the custom scheme **`playscopa://`** so links work
  before Universal Links are verified. Simulator test:

  ```bash
  xcrun simctl openurl booted "playscopa://join/BRISCOLA-AB12"
  ```

  iOS shows "Open in Scopa AI?" for scheme links from another app; tap Open.

Universal Links (`https://playscopa.net/join/…` opening the app):

1. Done: `ios/App/App/App.entitlements` declares `applinks:playscopa.net`
   and `applinks:playbriscola.com` (wired through `CODE_SIGN_ENTITLEMENTS`).
   The capability needs the paid Apple Developer team; with the free
   Personal Team the device build fails to sign, so set the paid team in
   `ios/Signing.local.xcconfig` first. Automatic signing registers the
   capability on the App ID.
2. Done (2026-09-15): both domains serve
   `https://<domain>/.well-known/apple-app-site-association` (JSON,
   `Content-Type: application/json`, no redirect) naming the paid team's
   app. The file lives in `public/.well-known/` (shared by both builds);
   `local/Caddyfile` has the `@aasa` header rule that gives the
   extension-less file its type (copied to the VPS Caddyfile). Apple's CDN
   mirror, `https://app-site-association.cdn-apple.com/a/v1/playscopa.net`,
   shows what devices will see:
   ```json
   {"applinks":{"apps":[],"details":[{"appID":"62L74J562X.net.vvlabs.scopa","paths":["/join/*"],"components":[{"/":"/join/*"}]}]}}
   ```
3. Reinstall the app; iOS fetches the AASA at install (Apple's CDN may
   take a while to pick up a new file). Test from Notes: a
   `https://playscopa.net/join/SCOPA-AB12` link should open the app.

## Layout after multitasking resizes

On an iPad the web view is resized by Split View, Slide Over and the
windowed multitasking of iPadOS 26. After such a resize the play area
was seen to keep the narrower width once the app was full screen again
(a 561-point band centred on a 1194-point screen), while the media
queries had already moved on: viewport units inside custom properties
were not re-resolved. `index.css` therefore sizes the play area and the
cards from `--viewport-width` and `--viewport-height`, which `index.html`
(width, every build) and `src/platform/bootstrap.ts` (both, the app
only) feed from the layout viewport on resize, orientation change, page
show, focus, visibility change, app resume, and a one-second check. The
website keeps the `100vh` fallback for card heights so the mobile
address bar does not resize the cards. Scratchpad `e2e_viewport.py`
checks the width path in WebKit and Chromium; the multitasking path
itself needs an iPad.

## Screen stays on in watch mode

Watch mode (bot against bot) has no touch input for minutes, so an iPad
would auto-lock mid-game. `src/hooks/useKeepAwake.ts` holds the screen
awake while a watch-mode game is in progress in either game and releases
it at game end, reset or unmount. In the app that is the system idle
timer through `ios/App/App/KeepAwakePlugin.swift`; on the website it is
the Screen Wake Lock API where the browser offers it (re-requested when
the page comes back to the foreground, since browsers drop it when
hidden). Normal play is untouched: every turn is a touch.

## Language

The interface is English or Italian. The first launch picks one in this
order: the player's saved choice (`scopa-language`), the language iOS chose
for the app, English. The web view reports only the FIRST device language
(`navigator.languages` has one entry on iOS), so a phone set to German,
then Italian, used to start in English. The app now asks iOS instead:
`Info.plist` declares both languages (`CFBundleLocalizations`: en, it), iOS
matches the device's ordered language list against them, and the
`BuildInfo` plugin's `language` method returns the result
(`Bundle.main.preferredLocalizations.first`). `bootstrapNative()` hands it
to `src/i18n/systemLanguage.ts` before the first render, and
`detectLanguage()` (`src/i18n/LanguageContext.tsx`) reads it. The App Store
country plays no role anywhere. The declaration also makes the store page
list "English, Italian", and iOS uses it for the texts it draws inside the
app's own process (edit menus, alerts): with English alone declared those
stay English on an Italian device (standard iOS behaviour, not tested
separately here; the rating prompt comes from a system process and follows
the device language either way).

Verified in the Simulator (iPhone 17, iOS 26.5, 2026-10-01), fresh install
each time: device language Italian → Italian (also with the 1.0 bundle,
which declared English only); Ukrainian, Italian, English → Italian
(`[native] app language: it` in the console; English before the change);
English first → English.

With an Italian interface the cloud models also write their reasoning in
Italian: the system instruction gets one closing line
(`src/ai/reasoningLanguage.ts` reads the interface language from `src/i18n/currentLanguage.ts`; the line is appended by `systemInstruction()` in each
game's `ai/prompts.ts`). The on-device model keeps its English instruction;
it was tuned on that text.

## Rating prompt

Apple allows one way to ask for a rating: StoreKit's review request. The
system decides whether the prompt really appears (at most three times in
365 days per user, never in a TestFlight build, always in a development
build), and it must not be the answer to a tap. `src/platform/review.ts`
decides when to ask: after a finished game the player WON (solo or online,
either game, never a watched game), once three games have been finished on
the device, and not again for 120 days. The count lives in the storage
seam under `review-prompt`. The request goes through the app's own
`Review` plugin (`ios/App/App/ReviewPlugin.swift`:
`AppStore.requestReview(in:)`, `SKStoreReviewController` before iOS 16),
loaded on demand two seconds after the end-of-game screen appears. The
website has no equivalent and does nothing.

Verified in the Simulator (2026-10-01) with a Debug build: the plugin
answers `{"requested":true}` and the system prompt appears, in the device's
language. The bundle's own end-of-game hook was called three times in a
test copy of the app (won, lost, won): the third call asked for the prompt
two seconds later, the state landed in Preferences
(`ScopaAI.review-prompt`), and the same three calls after a relaunch asked
for nothing. Not played through: a real game ending in the app (the four
call sites in `ScopaApp.tsx` and `BriscolaApp.tsx`). To see it on a
device, run a Debug build from Xcode and win the third finished game; a
TestFlight build never shows the prompt.

## Sounds

The web view of the packaged app cannot be relied on to decode MP3
through Web Audio: the iPad build running on a Mac ("Designed for iPad")
has no MP3 decoder in its content process, and every effect fails with
"unable to find converter". The native bundle therefore carries the
effects in the format named by `VITE_NATIVE_SOUND_FORMAT` in `.env.ios`,
converted from `public/sounds/*.mp3` by the `nativeSounds` plugin in
`vite.config.ts` with macOS's `afconvert` when the bundle is written (the
MP3s are left out): `wav` is 22 kHz 16-bit PCM, about 0.7 MB, needs no
decoder and is the setting in use; `m4a` (AAC at 64 kbit/s, about 140 KB)
was tried and fails in the Mac runtime exactly like MP3 ("unable to find
converter"), so it is only an option for real devices, where every format
decodes. `src/hooks/useSound.ts` requests that
extension in native builds and `.mp3` on the website, whose precache list
stays as it is. On a Mac the app delegate also activates a playback audio
session; phones and iPads keep the default so the mute switch is
respected.

## On-device AI opponent (Apple Intelligence)

The app offers an "Apple Intelligence" opponent that runs on the system
language model of iOS 26 and later (the Foundation Models framework):
no API key, no network, nothing leaves the device. It appears as the
"On-device AI" category of the opponent picker, in both games and in the
watch-mode seats, only when the shell reports the model as usable
(`[native] on-device model: available` in the console); otherwise the
category is simply absent and a remembered choice falls back to the CPU.

- **Requirements:** iOS 26 or later on a device eligible for Apple
  Intelligence (iPhone 15 Pro and later, iPads and Macs with Apple
  silicon), with Apple Intelligence turned on and its model downloaded.
  The Simulator uses the host Mac's Apple Intelligence, so on a Mac
  where it is off the console says `unavailable (Apple Intelligence not
  enabled)`.
- **Native side:** `ios/App/App/AppleIntelligencePlugin.swift`
  (registered in `MainViewController`): `availability` maps
  `SystemLanguageModel.default.availability`; `selectMove` uses one
  `LanguageModelSession` per move (the prewarmed one when its
  instructions match, else a fresh one) with the rules as instructions
  and asks for a guided-generation answer whose schema is built per
  request (`moveChoiceSchema`, `DynamicGenerationSchema`) so the move
  index carries a range guide of 0 to the number of legal moves minus
  one: constrained decoding then cannot produce an index out of range,
  which a compile-time `@Generable` type could not express. The answer
  is generated in this order: `candidates`, a counted array (two or
  three, at most the number of moves) of the strongest legal moves with
  a note of at most twelve words each on why the move is good or risky,
  then `reasoning`, the one-sentence verdict naming the best move
  (its description asks for cards from the request only), then
  `moveIndex`, so the choice is conditioned on the comparison the model
  wrote first (Apple's prompting guidance), with `maximumResponseTokens`
  384 and temperature 0.3 (0.5 until 2026-09-15). The comparison
  is a counted array rather than free text: as free text the small
  model sometimes kept listing moves until the token budget ran out and
  the answer failed to decode (2 of 10 moves in a Simulator run), and on
  the host model the free-text shape invented captures in two of three
  answers while the candidates' notes matched the real legal moves.
  Before the range guide, one Simulator move answered index 2 with two
  legal moves (the verdict merged both candidates into one imaginary
  move), and one 320-token answer failed to decode. With the per-request
  schema and 384 tokens a Simulator watch game had 13 of 14 model moves
  answered in 2.5 to 5.6 seconds and no index out of range; the one
  miss was a decode failure after 7.8 seconds, played by the heuristic. Do not try a
  `.pattern` regex guide to cap the text: with `.{20,400}` every request
  ran past the 20-second deadline and the Mac's on-device inference
  provider (`TGOnDeviceInferenceProviderService`) was left spinning at
  full CPU until killed with sudo. The bots render the answer
  (`composeReasoning` in `src/ai/onDeviceBot.ts`) as one line per
  weighed move, named by its card since the model only knows indexes,
  with "✓" as the bullet of the move it chose, then the verdict as its
  own paragraph capped at two sentences (the model tends to keep going
  and invent from the second sentence on); a note that starts by
  repeating its move ("Play 7 of cups: takes...") loses that prefix, and
  the reasoning modal keeps the line breaks (`white-space: pre-line`).
  Until 2026-09-15 the notes and the verdict were joined into one line
  with spaces, which read as gibberish with extra moves. The framework is weak-linked (`OTHER_LDFLAGS`) so the binary still
  launches on iOS 15 to 18, where every method reports "unavailable".
- **Web side:** `src/platform/appleIntelligence.ts` probes the plugin
  during `bootstrapNative()` and fills the registry in
  `src/ai/onDeviceModel.ts`, which is all the bots import (the website
  bundles carry no plugin code). `src/games/scopa/ai/apple.ts` and
  `src/games/briscola/ai/apple.ts` send one compact request per move
  (`SYSTEM_INSTRUCTION_ON_DEVICE` plus the current position, a round
  memory and the numbered legal moves, well inside the model's
  4096-token window), accept the answer when the index is legal, and
  otherwise play the heuristic bot's move with the reason shown like any
  other bot's. Each move logs `[apple] Scopa move in N s (answer, W
  words)` (or `[briscola apple] move in ...`) to the console.
- **Prompt for a small model (rewritten 2026-09-15):**
  `SYSTEM_INSTRUCTION_ON_DEVICE` in each game's `ai/prompts.ts` is its
  own short text (about 250 words, not the cloud bots' rules block):
  what matters in the game in a few lines, an explicit "you cannot see
  the opponent's cards or the deck, never describe or guess them", and
  the answer shape. The model gets no history, so `buildRoundMemory`
  adds a three-line round memory before the position: Scopa, the coins
  captured by each side, where the 7 of coins is, the scope this round;
  Briscola, the points each side holds, the trump count (played, in
  hand, still out), how many Aces and 3s are still out, and once the
  deck is empty the opponent's exact hand. The legal moves are spelled
  out by `formatOnDeviceMove`: Scopa, what each captures, a SCOPA named
  as such, or "no capture, it stays on the table"; Briscola, a "(trump)"
  tag, and when following whether the card wins the trick and the
  points that change hands, when leading the points it puts at risk.
  The first version carried the cloud rules block plus a dense memory
  (both primiera hands by suit, the unseen values by count, the trumps
  and high cards played and still out): a TestFlight game on 2026-09-15
  showed the model reading the opponent's primiera list as the
  opponent's hand ("leaves the opponent with 10 coins, 7 swords, and 2
  clubs") and a host-model harness reproduced invented captures, a
  non-trump called a trump and aces led into a trump, so the prompt was
  cut to what a three-billion-parameter model can use and the facts the
  rules already know were written into the move lines. Measured with
  that harness (the plugin's schema against the Mac's own model, seven
  positions, three runs each): cards named that were not in the
  position went from 13 to 0 in 21 answers, the verdict from 32 words
  and 1.8 sentences to 13 words and one sentence, the answer from 3.6
  to 2.6 seconds, and the right move on the three Briscola positions
  from 3 of 9 to 8 of 9 (the safe lead needed the words "safe lead" in
  its move line); the Scopa 7-of-coins capture went from 0 of 3 to 3 of
  3. One answer in 21 still failed to decode in both versions (played
  by the heuristic). The cloud bots' prompts are unchanged (they carry
  history). Covered by the `prompts.test.ts` files of both games.
- **Prewarming:** the shell's `prewarm` loads the model and prepares a
  session with the instructions ahead of the request
  (`LanguageModelSession.prewarm`), keeping at most one prepared session
  keyed by its instructions. The bots call it when a game starts with an
  on-device seat (`prewarmAppleAI` from Scopa's `handleStartGame`,
  Briscola's round-start hook), and again right after every answer, so
  the next session is ready while the human thinks. `releaseSession`
  drops it when a game is left (`cancelOnDeviceRequests`).
- **Deadline and cancellation:** every request carries an id and a
  20-second deadline (`ON_DEVICE_TIMEOUT_MS`). The shell rejects the call
  and cancels the generation when the deadline passes; the bot adds a
  short grace for a bridge that never answers, then plays the heuristic
  move. A new request for the same seat, a new game, the next round, a
  reset or a game switch cancels whatever is still in flight
  (`cancelOnDeviceRequests`, the plugin's `cancel`), and a reply that
  arrives after that is ignored. Covered by `src/ai/onDeviceBot.test.ts`.
- **When the model does not deliver:** a timeout, a failure or an index
  the game cannot use makes the bot play the heuristic move instead, and
  the move is marked: the thinking bubble turns amber with a badge and
  its label reads "The AI did not answer this time, so a simple move was
  played", and the reasoning modal titles the text "Fallback move" with
  the reason (`lastMoveWasFallback` on the bots, `fallback` on the
  last-move record). To exercise that path on purpose, build with
  `VITE_ON_DEVICE_TIMEOUT_MS=1000` (the shell keeps a one-second floor).
  On the website the dev server accepts a stand-in model: a page script
  that runs before the app can set `window.__scopaTestModel` (the
  `OnDeviceModel` shape) and `src/main.tsx` registers it in development
  builds only, which is how the fallback mark is tested end to end
  without a device.
- **What to expect:** the model is small, so it plays at about the level
  of the simple CPU bots and answers in a few seconds (the first move
  after launch is slower while the model loads, prewarming hides most of
  it); it is the zero-setup, offline option, not the strongest one. No token or cost
  badge is shown (there is nothing to count); the reasoning sentence is,
  in both games, through the same thinking bubble as the cloud models.
  Nothing changes in the privacy manifest: no data is collected.
- **Name and icon:** the opponent is "Apple Intelligence" with a sparkle
  icon in the Apple Intelligence palette (`AppleIntelligenceIcon.tsx`),
  deliberately not the Apple logo, which third-party apps may not use.
  In the scoreboard on phones it reads "Apple AI" so the top row fits.

## Configuration and distribution

- **Bundle id and signing:** `ios/Signing.xcconfig` (`PRODUCT_BUNDLE_IDENTIFIER`,
  `DEVELOPMENT_TEAM`, versions) is included by both build configurations;
  edit it or override per build
  (`xcodebuild … DEVELOPMENT_TEAM=ABCDE12345`). For device builds from
  Xcode put the team in `ios/Signing.local.xcconfig` (git-ignored,
  included at the end of `Signing.xcconfig`); the project file carries no
  team, so a personal identity never reaches the repository. `CAP_APP_ID` only affects a
  fresh `cap add`. Simulator builds use ad-hoc "Sign to Run Locally"
  signing, which is also what makes the Keychain reachable in the Simulator.
- **App Store build:** `npm run ios:release` (`ios/release.sh`, options in
  `ios/ExportOptions.plist`): web bundle, unsigned Release archive, the
  app's entitlements stamped in with the team's development certificate
  (ad-hoc when the keychain has none: the command-line export still works,
  Xcode's Organizer then refuses the archive), then the export
  (or the upload, with `-- --upload`) through Xcode's automatic
  distribution signing, which uses the team's cloud-managed distribution
  certificate and its Xcode-managed store profile. Product → Archive in
  Xcode needs a registered device in the team (archives are
  development-signed and re-signed at export); the script does not. The
  team id comes from `ios/Signing.local.xcconfig`. Runbook:
  `docs/app-store.md`.
- **Icons / splash:** `ios/App/App/Assets.xcassets` (1024² app icon and a
  2732² splash rendered from the existing PWA icon on the green felt; the
  splash hides once the first frame is on screen). The icon's card fan was
  enlarged 1.35× on 2026-09-19 (it covered 63% of the width and read as a
  blob at list sizes); the felt and the three cards are unchanged, and the
  file has no alpha channel (App Store Connect rejects transparent icons).
- **Version:** `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` in
  `ios/Signing.xcconfig`; the in-app footer shows the git-derived build
  version like the website.
- **Privacy manifest:** `ios/App/App/PrivacyInfo.xcprivacy` is in the app
  target's Resources build phase (App Store review rejects uploads
  without it). It declares no tracking, three collected data types for
  analytics, none linked to the user (product interaction: the Swetrix
  pageviews and gameplay events; coarse location: the country the
  analytics server derives from the IP address; performance data: the
  page-load timings the client attaches to the first pageview), and the
  two "required reason" APIs the storage layer uses: UserDefaults through
  the Preferences plugin (`CA92.1`) and file timestamps through the
  Filesystem plugin (`C617.1`). Capacitor's own framework ships its
  manifest through SPM. The App Store Connect nutrition labels must say
  the same (Analytics: Product Interaction, Coarse Location, Performance
  Data; not linked to identity; no tracking). Details and the
  invitation-code scrubbing: `docs/analytics.md`. Revisit both if a
  plugin or an SDK with data collection is added.
- **Analytics:** `.env.ios` carries the Swetrix settings of the Scopa
  website's project; `src/analytics/gate.ts` lets only a Release build
  compiled without `DEBUG` on a real device load the tag, using the
  BuildInfo plugin's report. Debug builds and the Simulator log
  `[analytics] off: …` and send nothing (verified, `docs/analytics.md`).
- **External links:** in the app, links that target a new tab (the privacy
  policy, GitHub, the provider sites) open in an in-app browser sheet
  (`@capacitor/browser`, SFSafariViewController with a Done button) through
  a document-level click handler in `src/platform/bootstrap.ts`; the web
  view's default sent them to Safari, from which the page's "back" link
  landed on the website instead of the app (TestFlight feedback,
  2026-09-18). The plugin is imported on the first such tap, native only.
- **Release checklist:** `docs/app-store.md` (what is done in the repo,
  the account-side steps, the listing copy, privacy answers, review notes).

## Verification record (2026-09-13)

Automated: `npm test` (322 unit tests incl. `src/platform/*.test.ts`),
`npm run lint`, `npm run build`, `build:briscola`, `build:itch`,
`build:ios` (native bundle checks: no `sw.js`, no analytics/SW blocks,
production URLs present, Capacitor-free web bundles), the website
end-to-end suites unchanged, `npm run ios:build` (Xcode 26.6, SPM) with
`PrivacyInfo.xcprivacy` present in the built `App.app` next to
Capacitor's own.

Simulator (iPhone 17, iOS 26.5): app launches from the local bundle; native
storage hydrates and persists across relaunch (Preferences, Filesystem
directory, Keychain reachable through the local plugin); first-launch
chooser renders with card art; a remembered Briscola selection reopens
Briscola (lazy chunk from the bundle) with the safe-area layout; custom-
scheme links reach the iOS "Open in Scopa AI?" prompt.

Review follow-ups, same day: the storage rules for unreadable data are
unit-tested (13 tests across `storage.test.ts` and `nativeStores.test.ts`),
and an end-to-end script drives real Scopa and Briscola rooms on the
website builds and fires the in-app invitation event into the waiting
room, the lobby without a room, a Briscola code inside a Scopa room, and
the reconnecting screen (the server replaced by one that never answers):
36 checks, all passing. Two adjacent defects that script exposed are
fixed too: `leaveRoom()` in both multiplayer hooks left `isReconnecting`
set, so the "Reconnecting…" screen outlived the room and blocked the
lobby (also after Leave Game then Multiplayer), and the shared confirm
dialog sat below the 1000-level overlays (round-end card, opponent
disconnected, capture choice), so a prompt arriving over one of them
could not be answered.

Still needs a person at the Simulator or a device: tapping through a full
Scopa and Briscola game against the CPU, the mid-game switch confirmation,
keyboard dismissal in the lobby and Settings, accepting the deep-link
prompt (invite lobby / other-game hand-over), Universal Links after the
AASA setup, free-AI proxy after the CORS change, and audio resume after
backgrounding on a real device.
