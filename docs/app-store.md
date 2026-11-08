# App Store release checklist (iOS app)

**Status: version 1.0.2 (build 8) released on 2026-10-27** (uploaded and
submitted 2026-10-26, approved overnight). **Version 1.0.3 is prepared and build 9 is uploaded
(2026-11-07 20:23, processing); the version itself is not yet created in App
Store Connect** (see "Version 1.0.3" below): the Italian name,
subtitle and keywords, captioned screenshots in both languages, the
preview videos, and a lead on "no ads". The product page's "Languages"
line now reads "English and Italian" in every storefront checked (IT, US,
GB, DE; lookup API `languageCodesISO2A: ["EN","IT"]`), after 1.0 and
1.0.1 had read "English" only (see "Version 1.0.2" below). Version 1.0.1
(build 7) was released on 2026-10-06; version 1.0 (build 6) on 2026-09-29
(submitted 2026-09-19, one rejection on 2026-09-24 for OpenAI/GPT metadata
references on the China storefront, resolved by deselecting China
mainland). Store page: https://apps.apple.com/app/id6812582287

The packaged app is `ios/App` (Capacitor), bundle id `net.vvlabs.scopa`
(the company's id; not the prototype's `net.vovchenko.scopaai`, which the
free Personal Team had registered on 2026-09-13 — Apple keeps App IDs
unique across teams, so the paid team VV Labs LLC (Team ID 62L74J562X)
could not use it — and not the interim `net.vovchenko.scopa`, registered
under VV Labs on 2026-09-15 and never uploaded; the id is permanent once a
build has been uploaded),
display name "Scopa AI", both games inside (`docs/ios.md`). This page is the
release runbook: what the repository already carries, the steps that need
the Apple Developer account, and the listing content.

## Done in the repository (2026-09-15)

- `Info.plist`: `ITSAppUsesNonExemptEncryption = false` (HTTPS only, so no
  export-compliance questionnaire on each upload), `UIRequiredDeviceCapabilities`
  = `arm64` (App Store Connect flags the obsolete `armv7`), custom URL scheme
  `playscopa://`, all orientations, iPad multitasking allowed.
- `App.entitlements`: Associated Domains `applinks:playscopa.net`,
  `applinks:playbriscola.com` (Universal Links for invitations), wired through
  `CODE_SIGN_ENTITLEMENTS` in the project. Needs the **paid team**: the free
  Personal Team cannot sign this capability. `ios/Signing.local.xcconfig`
  (git-ignored) carries `DEVELOPMENT_TEAM = 62L74J562X` (VV Labs LLC).
- Universal Links are live: both domains serve
  `/.well-known/apple-app-site-association` as `application/json` for
  `62L74J562X.net.vvlabs.scopa` (`public/.well-known/`, Caddy `@aasa`
  rule on the VPS); Apple's CDN mirror at
  `https://app-site-association.cdn-apple.com/a/v1/playscopa.net` shows
  what devices will see (it re-fetches on its own schedule).
- `PrivacyInfo.xcprivacy`: no tracking; collected data = Product Interaction,
  Coarse Location, Performance Data (analytics, not linked to the user);
  required-reason APIs UserDefaults `CA92.1`, file timestamps `C617.1`.
- App icon: single 1024×1024 PNG without alpha (Xcode single-size icon).
  Launch screen: storyboard with the felt-green splash.
- Version `MARKETING_VERSION 1.0`, build `CURRENT_PROJECT_VERSION 1`
  (`ios/Signing.xcconfig`). Bump the build number for every upload.
- The free-AI proxy allows the app's origin (`capacitor://localhost`) — the
  systemd unit `scopa-proxy` on the VPS, `ALLOWED_ORIGIN` comma-separated.
- Phone layout: the game's top row (scoreboard, controls, opponent pile,
  token badge) fits at 440 / 402 / 375 / 360 pt with a cloud model playing;
  the opponent picker's selects leave room for their arrow.
- "Sign in with OpenRouter" is hidden in the app (its web view cannot be a
  callback target); pasted keys go to the Keychain.
- Screenshots at the required sizes, from the web build at device
  viewports: `local/appstore/screenshots/iphone-6.9` (1320×2868) and
  `ipad-13` (2064×2752) — chooser, Scopa start, Scopa game with AI
  reasoning, Briscola start, Briscola game with AI reasoning. Regenerate
  with the session's `store_shots.py` pattern (Playwright, OpenRouter mocked).
- AI data notice (App Review Guideline 5.1.2(i), sharing with third-party
  AI): `AIConsentModal` opens before the first game against the free AI or
  own-key opponent, in both games and in watch mode, naming what is sent
  (the game's cards, scores and moves, and no other data) and where
  (our proxy then Google for the free AI; straight to the chosen provider for
  a key). "Allow" is remembered through the storage seam
  (`src/ai/consent.ts`, key `ai-data-consent`); "Not now" seats a CPU
  opponent. Settings shows the answer and can show the notice again. The
  website shows the same notice. `public/privacy.html` describes both
  paths. CPU bots and Apple Intelligence need no notice.
- App Store build from the command line: `npm run ios:release`
  (`ios/release.sh` with `ios/ExportOptions.plist`) builds the web bundle,
  archives Release unsigned, stamps `App.entitlements` in with an ad-hoc
  signature and exports through Xcode's automatic distribution signing;
  `-- --upload` sends the build to App Store Connect instead. Verified
  2026-09-15: `ios/build-release/export/App.ipa` (1.0 (1), 10 MB) is signed
  "Apple Distribution: VV Labs LLC" with the store profile and carries the
  Associated Domains entitlement. Product → Archive in Xcode needs a
  registered device in the team (Xcode signs archives for development and
  re-signs them at export); the team has none and the App Store needs none.
  Manual distribution signing is not available either: the certificate is
  cloud-managed (no local private key) and the store profile Xcode-managed.

## Account-side steps (in order)

1. Done: the paid team (VV Labs LLC, `62L74J562X`) is signed in in Xcode
   and set in `ios/Signing.local.xcconfig`.
2. Done: Universal Links file live on both domains (see above).
3. **App Store Connect → My Apps → + → New App**: platform iOS only (iPad
   is part of iOS; Mac and Vision Pro availability are per-app settings
   later, not platforms here); Company Name (asked once, for the team's
   first app: the developer name shown under every app's title on the
   store, not changeable afterwards; the legal entity "VV Labs LLC" is
   shown separately as the seller) — `VV Labs`; name (below); primary
   language English (U.S.) (Italian is added as a localization of the
   version later); bundle id `net.vvlabs.scopa` (the export in
   `npm run ios:release` registers the App ID under VV Labs with the
   Associated Domains capability; Xcode labels it "XC net vvlabs scopa"
   in the menu — reload the page if it is missing); SKU `scopa-ai-ios`
   (internal, never shown, not changeable); User Access: Full Access.
4. **Build and upload**: bump `CURRENT_PROJECT_VERSION` in
   `ios/Signing.xcconfig` if this build number was uploaded before, then
   `npm run ios:release -- --upload` (the team must be signed in in Xcode;
   the upload goes through Xcode's account session). If that session has
   expired the export step fails with "exportArchive Failed to Use
   Accounts": sign in again in Xcode → Settings → Accounts, or give the
   script an App Store Connect API key (App Store Connect → Users and
   Access → Integrations → App Store Connect API → generate a key with the
   App Manager role, download the `.p8` once) in the git-ignored
   `ios/AppStoreConnect.local.env`: `ASC_KEY_PATH=/path/AuthKey_KEYID.p8`,
   `ASC_KEY_ID=KEYID`, `ASC_ISSUER_ID=<issuer uuid>`; xcodebuild then
   authenticates with the key instead of the session. Without
   `--upload` the build lands in `ios/build-release/export/App.ipa`, which
   the Transporter app can upload. The script archives *Release* (the
   analytics gate only enables sending in a Release build on a real
   device). Processing takes a few minutes; the build then appears under
   TestFlight and in the version's build picker. Done for 1.0 (1) on
   2026-09-15 ("Upload succeeded", straight from the archive with the
   export options switched to `destination = upload`);
   `CURRENT_PROJECT_VERSION` is already 2 for the next upload.
5. **TestFlight** first: an internal group ("Scopa testing", automatic
   distribution on, so every upload reaches it without Beta App Review;
   testers are App Store Connect users, invited by e-mail, and install
   through the TestFlight app). External testers (anyone with an e-mail
   or the public link) need Beta App Review once per version: TestFlight →
   Test Information (description, feedback e-mail, privacy policy URL)
   and the build's "What to Test" text, e.g.: "Play Scopa and Briscola
   against the CPU (Esperto), the free AI opponent and, if you have a key,
   an AI model. Check the notice before the first AI game, the reasoning
   bubble, online multiplayer with a friend (or against the website), and
   an invitation link from Notes. On iOS 26 devices try the Apple
   Intelligence opponent. Please report anything that looks wrong in the
   layout on your device, in English or Italian." For build 4 (2026-09-19)
   add: "New since build 3: links such as the privacy policy open inside
   the app (please try the one in the notice before an AI game), the
   opponent categories are CPU / AI (free) / Apple AI / AI (your key), the
   scoreboard shows short model names on phones, Briscola shows its quick
   rules on phones, and the default AI models changed (Gemini 3.8 Flash,
   GPT-5.6 Luna, Claude Sonnet 5)." Install on the iPad and an iPhone, play a CPU game,
   a free-AI game (proxy), an AI game with a pasted key, a multiplayer game
   against the website, and open a `https://playscopa.net/join/…` link from
   Notes (Universal Link) plus a `playscopa://join/…` link.
6. **App Privacy** (App Store Connect → App Privacy): "Yes, we collect data".
   - Product Interaction — Analytics — not linked to the user — not used for tracking
   - Coarse Location — Analytics — not linked — not used for tracking
   - Performance Data — Analytics — not linked — not used for tracking
   - No other types (API keys never leave the device except to the provider
     the user chose; the multiplayer nickname is transient game state).
   Privacy policy URL: `https://playscopa.net/privacy.html`.
7. **Age rating**: none of the questionnaire items apply (no gambling with
   money, no contests, no user-generated content beyond a nickname; the
   2025 questions on messaging/chat, social media features, unrestricted
   web access and advertising are all "no": multiplayer has a nickname and
   no chat) → 4+.
8. **Pricing**: free; availability all territories EXCEPT China mainland
   (review 2026-09-24, guideline 5 Legal: any metadata mention of OpenAI /
   GPT needs Chinese DST permits or the storefront deselected; Hong Kong
   and Macao are separate storefronts and stay); no in-app purchases.
9. **Trader status (EU Digital Services Act)**: App Store Connect →
   Business → Trader Status (Account Holder or Admin). Without it the app
   is not distributed in the EU, and App Store Connect shows the banner
   until it is answered. A company distributing apps counts as a trader:
   Apple verifies name, address, email and phone and shows them on the EU
   product page.
10. **Submit for review** with the notes below; expect questions about the
   BYOK keys (answer: the app never sells API access; users optionally
   bring a key from a provider they already pay).

## Listing copy (drafts)

- **Name** (30): `Scopa & Briscola AI` (the record's name since 2026-09-15;
  both game names in the strongest search field; changeable with a later
  version, unlike the SKU and the Company Name). The home-screen label
  stays "Scopa AI" (`CFBundleDisplayName`).
- **Subtitle** (30): `Classic Italian card games` (26; changed 2026-09-19 from `Italian card games vs AI`: most players use the CPU bots and the name already says AI)
- **Promotional text** (170): `Play Scopa and Briscola against smart CPU
  opponents, your own AI models (GPT, Claude, Gemini, OpenRouter) or friends
  online. Offline, ad-free, with six traditional decks.`
- **Description** (4000 max; 3626 characters; the user's 2026-09-19 edit of the Play Store text, proofread):

```text
Scopa & Briscola AI brings two beloved Italian card games to your iPhone and iPad with smart opponents, beautiful authentic card decks, and modern analysis tools.

CLASSIC GAMEPLAY
Scopa: capture cards from the table by matching values or combining cards that sum to your played card. Score points for most cards, most coins, the precious Sette Bello (7 of Coins), the best Primiera, and every Scopa (a capture that clears the table).
Briscola: the trick-taking game with a trump suit. Win tricks with the highest card of the suit led or with a trump. Aces and 3s are worth the most, and whoever collects more than 60 of the 120 points wins the round. Play a single round or a best-of match.

MULTIPLE OPPONENTS
• Three CPU levels in each game: the playful Scimmietta, the crafty Furbo, and Esperto, an advanced bot (Monte Carlo tree search in Scopa, look-ahead search over sampled hands in Briscola)
• Free AI opponent (Google Gemini): no API key needed, a few games per day
• AI models with your own API key: Google Gemini, OpenAI GPT, Anthropic Claude, or hundreds of models through OpenRouter, with token usage and the estimated cost of every game shown as you play
• Apple Intelligence: an offline, on-device opponent on supported iPhone and iPad models
• Online multiplayer: play a friend via a room code or an invitation link, with an optional turn timer
• Watch mode: sit back and let two bots or AIs battle it out

GAME ANALYSIS — LEARN AS YOU PLAY
• Live expected-margin estimate: your projected point advantage for the round, computed by Esperto self-play simulation
• Per-card analysis: see the expected margin under each card in your hand — and, in Scopa, for every capture option — then compare your instinct with the engine's pick and sharpen your game hand after hand
• Curious how the AI thinks? Open its reasoning after every move

AUTHENTIC CARD DECKS
Choose from six beautiful regional Italian deck designs (Napoletane, Piacentine, Siciliane, Sarde, Bergamasche, Romagnole).
Plus two table styles: classic green felt or a homey tablecloth.

FEATURES
• No account, no sign-in — just open and play
• Clean, intuitive touch controls with drag-and-drop
• Per-opponent statistics and game history
• Available in English and Italian
• Adjustable text size for comfortable reading
• Sound effects
• Works offline against CPU opponents and Apple Intelligence
• No ads, no in-app purchases
• Dark theme optimized for comfortable play

HOW TO PLAY SCOPA
1. Each player receives 3 cards, and 4 cards go on the table
2. On your turn, play one card from your hand
3. Capture table cards that match your card's value, or cards that sum to it
4. Clear the table for a "Scopa" bonus point
5. Score points at the end for cards, coins, Sette Bello, and Primiera

HOW TO PLAY BRISCOLA
1. Each player receives 3 cards. The next card is turned face up and its suit is the trump (briscola)
2. The leader plays a card and the opponent answers with any card
3. A trump beats any other suit. Otherwise, the higher card of the suit led wins the trick
4. The winner draws first, then leads the next trick
5. Count your points: Ace 11, Three 10, King 4, Knight 3, Knave 2. Whoever gets more than 60 wins the round

Scopa and Briscola have been enjoyed in Italy for centuries. Now experience these timeless classics with modern AI opponents that provide a challenging and fun experience for players of all skill levels.

Perfect for quick games on the go or longer sessions at home. Whether you're learning the games for the first time or you're a seasoned player, Scopa & Briscola AI offers the authentic Italian card game experience.
```

- **Keywords** (100): `carte,napoletane,siciliane,gioco,online,multiplayer,offline,gpt,claude,gemini,trick,settebello` (94 chars; no spaces, and none of the words
  already in the name "Scopa & Briscola AI" or the subtitle "Italian card
  games vs AI", which Apple indexes on their own)
- **Support URL**: `https://playscopa.net/support.html` (public/support.html, added 2026-09-19:
  contact email, GitHub issues + repo, four FAQ entries; served by both domains; the
  GitHub issues page was the fallback before it existed)
- **Marketing URL**: `https://playscopa.net`
- **Copyright**: `2026 VV Labs LLC`
- **Category**: Games → Card (secondary: Games → Board)
- **What's New** (1.0): `First release: Scopa and Briscola with CPU, AI and online opponents.`

## Review notes (paste into "Notes" for App Review)

App Review Information also needs a contact (name, phone, e-mail) and
has "Sign-in required" unchecked: the app has no accounts. Apple expects
working credentials for any feature a reviewer cannot exercise otherwise
(guideline 2.1). The app has four key fields, each a separate code path
(Gemini, OpenAI and Claude call their vendor directly; OpenRouter is its
own provider), so the notes carry one test key per field, each capped:
Google AI Studio key from a separate *paid* project (the free tier allows
20 requests a day for the Flash models, less than one game; cap the
project by lowering its daily request quota in Cloud Console, the
prepaid balance is the outer ceiling), OpenAI key (project with a monthly
budget on a prepaid account), Anthropic key (workspace spend limit),
OpenRouter key (credit limit set on the key). A review game costs cents.
Delete all four after the review.

> Scopa & Briscola AI is a card game with no account, no purchases and no ads. Everything except the online opponents works offline. Sign-in is not required anywhere.
>
> How to test:
> - CPU opponents (offline): any game against Scimmietta, Furbo or Esperto, in Scopa or Briscola.
> - "AI (free)" category: the "Gemini 3 Flash Preview" entry uses our own Gemini proxy, no key needed, with an allowance of 3 games per day per device and a shared daily cap for all players. Before the first game against any AI service the app shows a data notice and asks for permission (guideline 5.1.2(i)); only the current game's cards, scores and moves are sent, and no other data.
> - "AI (your key)" category: users paste their own API key from OpenAI, Anthropic, Google or OpenRouter in Settings. The app never sells or resells API access; the key stays in the device's Keychain and is sent only to that provider. Test keys for the review, each with a small spending cap and valid during the review, to paste in Settings → API keys:
>   OpenRouter: sk-or-v1-XXXX
>   Google Gemini: AIzaXXXX
>   OpenAI: sk-XXXX
>   Anthropic Claude: sk-ant-XXXX
>   Each unlocks the "AI (your key)" category for that provider; the OpenRouter key also lists its models.
> - Apple Intelligence: an on-device opponent that appears only on devices with iOS 26 and Apple Intelligence enabled; it needs no key and sends nothing.
> - Online multiplayer needs a second player. The app and the website share the same game servers, so one reviewer can play both sides: tap Multiplayer in the app to create a room, then join that room as the second player either from the app on another device (open the invitation link, or enter the room code) or from any browser at https://playscopa.net (https://playbriscola.com for a Briscola room) via Multiplayer → Join.
>
> Privacy policy: https://playscopa.net/privacy.html
> Support: https://playscopa.net/support.html

## Marketing after release (Apple's marketing guidelines)

Source: https://developer.apple.com/app-store/marketing/guidelines/ (read
2026-09-29). What applies here:

- **Badge**: only Apple's artwork, unmodified (no recolouring, angle,
  animation), the black badge, at least 40px tall on screen with clear
  space of a quarter of its height, one per layout, subordinate to the
  content. "App Store" is never translated; Apple provides the localized
  "Download on the" badges. The two files in `public/badges/`
  (`app-store-badge-en.svg`, `app-store-badge-it.svg`) were downloaded
  2026-10-01 from Apple's marketing toolbox
  (`toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/<locale>`)
  and are self-hosted so the page makes no request to Apple.
- **On the site**: `StoreBadges` (`src/components/UI/StoreBadges.tsx`,
  until 2026-11-07 `AppStoreBadge`) under the quick rules of both start
  screens: Apple's badge linking to `APP_STORE_URL` and, since 2026-11-07,
  Google's "Get it on Google Play" badge (`public/badges/google-play-badge-
  {en,it}.png`, from Google's badge generator, unmodified) linking to
  `GOOGLE_PLAY_URL` (`src/platform/links.ts`, package `net.vovchenko.scopaai`),
  with each store's credit line in the footer (`StoreCredits`).
  `showsAppStoreBadge()` hides Apple's badge inside the app and on Android;
  `showsGooglePlayBadge()` hides Google's inside the app, for iPhone and
  iPad visitors, and when the page runs as an installed app (display-mode
  standalone: the Play Store app itself, a home-screen PWA). `index.html` carries the Smart App Banner tag
  (`apple-itunes-app`, app id 6812582287), which Safari on iPhone and iPad
  turns into Apple's own banner. The support page links the store too.
- **Wording**: "available on the App Store", "Scopa & Briscola AI for
  iPhone and iPad"; never "iPhone app", "Apple App Store", "at the App
  Store". Credit line once per page with Apple marks: "App Store is a
  trademark of Apple Inc., registered in the U.S. and other countries."
- **Images and video**: device frames only from Apple's design resources,
  latest devices, never the Home Screen; a clip with cut waiting time needs
  a "sequences shortened" note.
- **Next levers**: a Featuring Nomination in App Store Connect (not done;
  angles: the on-device Apple Intelligence opponent, Italian localization).
  The Italian product page and the native rating prompt come with version
  1.0.1 (below; the prompt's rules are in `docs/ios.md`, "Rating prompt").

## Version 1.0.1 (prepared 2026-10-01)

What the build changes for players (`ios/Signing.xcconfig`: version 1.0.1,
build 7):

- With an Italian interface the cloud AI opponents write their reasoning
  in Italian (free Gemini, Gemini, GPT, Claude, OpenRouter). Checked with
  the free Gemini through the proxy: both games answered in Italian with
  Italian card names. The on-device model stays English.
- The remaining English texts of the Italian interface are translated
  (the capture row, watch-mode Pause/Resume, the multiplayer turn timer,
  Briscola's reconnect screen and round history, the empty table).
- The bundle declares English and Italian (`CFBundleLocalizations`), and
  the app starts in the language iOS picks from the device's language list
  (`docs/ios.md`, "Language"). Version 1.0 already started in Italian on a
  phone whose FIRST language is Italian; the change covers phones with
  another first language and Italian ahead of English. (The declaration was
  expected to make the store page list both languages as well. It did not:
  the store reads the `*.lproj` folders, see "Version 1.0.2".)
- The rating prompt after a won game (`docs/ios.md`, "Rating prompt").

Steps in App Store Connect:

1. The + next to "iOS App" → version 1.0.1.
2. Build and upload build 7: `npm run ios:release`, then
   `open ios/build-release/App.xcarchive` and Distribute App in the
   Organizer (the command-line upload still fails on Xcode's expired
   session, see above).
3. On the 1.0.1 page, English (U.S.): fill "What's New" (below) and select
   build 7.
4. Language menu at the top right → add Italian, fill the Italian fields
   and upload the Italian screenshots (below). Name and subtitle are per
   language under App Information.
5. Add for Review → Submit to App Review.

**What's New, English**:

```text
Better Italian support: AI opponents now explain their moves in the app's language, and the interface is fully translated.
Small fixes.
```

**What's New, Italian**:

```text
• Gli avversari IA ora spiegano le loro mosse in italiano.
• Traduzione dell'interfaccia completata.
• Piccole correzioni.
```

**Italian screenshots**: `local/appstore/screenshots-it/` (git-ignored),
the same seven views and four sizes as the English set
(`iphone-6.9` 1320×2868, `iphone-6.5` 1284×2778, `ipad-13` 2064×2752,
`ipad-12.9` 2048×2732), with the Italian interface and Italian reasoning.
Rendered like the English set: the web build at device viewports, the
model mocked, the website's App Store badge hidden (the app has none).
To regenerate: start the dev server, then
`caffeinate -i python3 local/appstore/shots_it.py` (Playwright; the start
and reasoning views plus scored board candidates from scripted games land
in `local/appstore/store-it/`) and `python3 local/appstore/assemble_it.py
local/appstore/screenshots-it <device>:<game>=<board file> …` to pick the
boards and derive the two smaller sizes. No source edits while it runs:
a hot reload resets the games. `local/appstore/screenshots-it-overview-*.png`
are contact sheets for a quick look, not for upload.

## Italian localization of the product page (drafted 2026-10-01)

How: localizable metadata of a RELEASED version is locked (only the
promotional text stays editable), so Italian ships with the next version
(1.0.1, above): on its page use the language menu at the top right
(English (U.S.)) → add Italian, and fill the fields below; name and
subtitle are per language under App Information. Screenshots are optional
per language (the English set is used when a language has none). The
store's "Languages" line comes from the language folders (`*.lproj`) in
the bundle, not from `CFBundleLocalizations`: build 7 declared English and
Italian there and the store kept saying "English" in every storefront
(fixed in build 8, see "Version 1.0.2").

- **Name (30)**: `Scopa & Briscola AI` (19)
- **Subtitle (30)**: `Giochi di carte italiani` (24) — **never reached the
  store**: on 2026-11-07 the Italian product page still showed the English
  subtitle "Classic Italian card games" (the page shows Italian subtitles
  where they exist: WhatsApp's and Scopa Più's do), so the Italian subtitle
  under App Information is empty; the Italian keywords probably are too
  (see "Version 1.0.3").
- **Promotional text (170)**: `Gioca a Scopa e Briscola contro la CPU, i tuoi modelli IA (GPT, Claude, Gemini, OpenRouter) o gli amici online. Offline, senza pubblicità, con sei mazzi tradizionali.` (166)
- **Keywords (100)**: `napoletane,siciliane,piacentine,sarde,gratis,online,multigiocatore,offline,settebello,primiera,gpt` (98; no words from the name or the subtitle)
- **What's New (4000)**: the 1.0.1 text above
- **Description** (3847 characters):

```text
Scopa & Briscola AI porta su iPhone e iPad due dei giochi di carte italiani più amati, con avversari intelligenti, mazzi regionali autentici e strumenti di analisi moderni.

IL GIOCO CLASSICO
Scopa: prendi le carte dal tavolo con una carta dello stesso valore, oppure più carte la cui somma è pari al valore della tua. Si fanno punti con le carte, i denari, il Sette Bello (7 di denari), la primiera e ogni scopa (una presa che ripulisce il tavolo).
Briscola: il gioco di prese con un seme di briscola. La presa va alla carta più alta del seme giocato per primo o alla briscola. Asso e 3 sono le carte che valgono di più, e chi supera 60 dei 120 punti vince la mano. Si gioca una mano secca o al meglio di più mani.

TANTI AVVERSARI
• Tre livelli di CPU in ogni gioco: la giocosa Scimmietta, l'astuto Furbo ed Esperto, un bot avanzato (ricerca Monte Carlo ad albero nella Scopa, ricerca in avanti su mani campionate nella Briscola)
• Avversario IA gratuito (Google Gemini): senza chiave API, alcune partite al giorno
• Modelli IA con la tua chiave API: Google Gemini, OpenAI GPT, Anthropic Claude o centinaia di modelli tramite OpenRouter, con i token usati e il costo stimato di ogni partita mostrati mentre giochi
• Apple Intelligence: un avversario che gira sul dispositivo, anche offline, sui modelli di iPhone e iPad compatibili
• Multigiocatore online: gioca con un amico tramite un codice partita o un link di invito, con timer del turno opzionale
• Modalità Osserva: mettiti comodo e guarda due bot o due IA sfidarsi

ANALISI DELLA PARTITA — IMPARA GIOCANDO
• Stima in tempo reale del margine atteso: il tuo vantaggio previsto in punti per la mano, calcolato simulando partite di Esperto contro sé stesso
• Analisi carta per carta: vedi il margine atteso sotto ogni carta della tua mano — e, nella Scopa, per ogni presa possibile — poi confronta il tuo istinto con la scelta del motore e migliora mano dopo mano
• Vuoi sapere come ragiona l'IA? Apri il suo ragionamento dopo ogni mossa

MAZZI AUTENTICI
Scegli tra sei splendidi mazzi regionali italiani (Napoletane, Piacentine, Siciliane, Sarde, Bergamasche, Romagnole).
E due stili di tavolo: il classico panno verde o una tovaglia di casa.

CARATTERISTICHE
• Nessun account e nessun accesso: apri e gioca
• Controlli touch semplici e intuitivi, con trascinamento delle carte
• Statistiche per avversario e cronologia delle partite
• Disponibile in italiano e in inglese
• Dimensione del testo regolabile
• Effetti sonori
• Funziona offline contro gli avversari CPU e Apple Intelligence
• Nessuna pubblicità, nessun acquisto in-app
• Tema scuro pensato per giocare comodamente

COME SI GIOCA A SCOPA
1. Ogni giocatore riceve 3 carte e 4 carte vanno sul tavolo
2. Al tuo turno giochi una carta della tua mano
3. Prendi le carte del tavolo con lo stesso valore della tua, oppure quelle la cui somma è pari
4. Ripulisci il tavolo per un punto di "Scopa"
5. A fine mano si contano i punti per carte, denari, Sette Bello e primiera

COME SI GIOCA A BRISCOLA
1. Ogni giocatore riceve 3 carte. La carta successiva viene scoperta e il suo seme è la briscola
2. Il primo di mano gioca una carta e l'avversario risponde con una carta qualsiasi
3. La briscola batte ogni altro seme. Altrimenti vince la carta più alta del seme giocato per primo
4. Chi vince la presa pesca per primo e apre la presa successiva
5. Conta i punti: Asso 11, Tre 10, Re 4, Cavallo 3, Fante 2. Chi supera i 60 vince la mano

Scopa e Briscola si giocano in Italia da secoli. Ora puoi vivere questi classici senza tempo con avversari IA moderni, per un'esperienza divertente e impegnativa a ogni livello di gioco.

Perfetto per una partita veloce fuori casa o per sessioni più lunghe sul divano. Che tu stia imparando o sia un giocatore esperto, Scopa & Briscola AI offre l'autentica esperienza dei giochi di carte italiani.
```

## Version 1.0.2 (prepared 2026-10-26)

Why: on 2026-10-26, three weeks after 1.0.1 went live, the product page's
"Languages" line still read "English" in every storefront checked (Italy,
US, UK, Germany; the lookup API agreed, `languageCodesISO2A: ["EN"]`),
although build 7 declares English and Italian in `CFBundleLocalizations`.
The store derives that line from the language folders (`*.lproj`) inside
the app bundle, and the bundle had only `Base.lproj` (the two storyboards):
the interface is localized in the web bundle, so Xcode never had a reason
to create language folders. `CFBundleLocalizations` is for "the
localizations handled manually by your app" (all Apple's documentation
says about it) and does what `docs/ios.md`, "Language" describes: iOS
picks the app's language from the device's list. The store ignores it. An
Italian player who reads "Lingue: Inglese" skips the app, hence a version
for this alone. (Sources: Apple Developer Forums threads 836440 and
811804; mixable.blog, "Why does the iOS App Store show more languages than
my app supports?")

What build 8 changes (`ios/Signing.xcconfig`: version 1.0.2, build 8):

- `ios/App/App/en.lproj/InfoPlist.strings` and `it.lproj/InfoPlist.strings`
  (each sets `CFBundleDisplayName` to the same "Scopa AI"; the folders are
  the point), registered in the Xcode project as the variant group
  `InfoPlist.strings` in the Resources phase, and `it` added to the
  project's `knownRegions`. `CFBundleLocalizations` stays: it drives the
  start language.
- Web bundle: the working tree of 2026-10-26, which is the committed code
  (`6e51dc3`) plus the layout work of 2026-10-04: the analysis panel in a
  `GameLayout` slot under the hand with a measured fit, the deck side chosen
  by room, and the two patches from `local/layout-fix/patches/` applied on
  2026-10-26 (`tablecloth-numbers.patch`: the per-card numbers on dark pills
  on the tablecloth; `phone-landscape.patch`: the phone landscape layout for
  every iPhone held sideways, up to 960px wide). `docs/architecture.md`
  describes them ("Analysis panel placement", "Phone landscape layout"). The
  preview videos were filmed with this layout. A first build 8 without the
  layout work was made earlier the same day and discarded.

Build: archived and exported on 2026-10-26 (14:05) with
`npm run ios:release` (no upload): `ios/build-release/App.xcarchive` and
`ios/build-release/export/App.ipa` (10.6 MB, signed "Apple Distribution:
VV Labs LLC"), build log without warnings. Verified: the archive's
`App.app` and the `.ipa`'s `Payload/App.app` both contain
`en.lproj/InfoPlist.strings` and `it.lproj/InfoPlist.strings` next to
`Base.lproj` (the compiled strings hold the display name);
`CFBundleShortVersionString` 1.0.2, `CFBundleVersion` 8,
`CFBundleLocalizations` en + it. The bundled web code carries the layout
work: the stylesheet has the tablecloth pill variable (`--card-note-bg`),
the phone landscape query (`max-width:960px`, 10 rules) and the panel's
`data-fit` selectors (39), and `index.html` has the 960px desktop-site
limit. Checks before the build: 561 tests pass (59 files), ESLint 0 errors
in the sources (its one error is in `local/apppreview/App.app`, a copy of
the built app that `eslint .` walks into because `local/` is not in the
ignore list; 22 old warnings).

What's New (EN, 4000; kept short on purpose, the languages fix is a
store matter players never see):

```text
Better layout on phones held sideways, clearer analysis numbers, small fixes.
```

What's New (IT):

```text
Layout migliore sui telefoni in orizzontale, numeri dell'analisi più leggibili, piccole correzioni.
```

App Store Connect steps:

1. Upload build 8: Xcode → Window → Organizer → the archive
   `ios/build-release/App.xcarchive` → Distribute App → App Store Connect
   (or `npm run ios:release -- --upload --no-sync` with an API key in
   `ios/AppStoreConnect.local.env`, see `ios/release.sh`).
2. BEFORE submitting, check the languages the store will show: App Store
   Connect → TestFlight → iOS Builds → the processed build → "Store
   Information" → Localizations. Done 2026-10-26 for build 8: "English,
   Italian" (uploaded from the Organizer the same afternoon). Build 7
   would have shown "English" there; this is where to look for every
   future build.
3. App Store → iOS App → "+" → 1.0.2, select build 8, paste What's New in
   English and Italian. The description, keywords and URLs carry over;
   the PROMOTIONAL TEXT does not: App Store Connect leaves it empty on
   every new version (seen on 1.0.2), so paste it again in both languages
   (English under "Listing copy", Italian under "Italian localization")
   or the store shows none once the version is live. It stays editable
   after release without a new submission.
4. Add the preview videos to the iPhone 6.9" media of each language:
   `local/apppreview/out/app-preview-iphone-6.9.mp4` (English) and
   `app-preview-iphone-6.9-it.mp4` (Italian); the README there has the
   specifications and what is on screen. NOT DONE for 1.0.2: the live
   product pages of 2026-10-27 (US and IT) show screenshots only, no
   video. Media of a released version are locked, so the previews need
   either the next version (1.0.3, any build) or a Product Page
   Optimization treatment carrying them, applied to the default page:
   sidebar → Growth & Marketing → Product Page Optimization → new test
   with one treatment, localizations English (U.S.) + Italian → in the
   treatment, device tab "iPhone with Dynamic Island (medium display)"
   (the slot that takes 886 x 1920; the other sizes scale from it), drag
   the English preview in front of the screenshots, switch the language
   menu to Italian and add the Italian one → Start Test (App Review
   approves the treatment) → once running, "Apply Treatment to Current
   Product Page": permanent, stops the test, no new version needed (Apple's
   help, "Apply a test treatment to your product page").
5. App Review Information: the Notes carry over from the previous
   version with their dated lines on top. Replace those lines (Sept 24,
   Oct 2) with one for this version:

   ```text
   Oct 26 (1.0.2): layout improvements (phones held sideways, the analysis panel) and the app bundle now carries English and Italian localization folders so the store lists both languages. No new features, permissions or data use.
   ```

   Then check the four test API keys in the notes: they are deleted after
   each review ("Review notes" above), so the carried-over notes may list
   dead keys, and a reviewer who tries one gets an error (guideline 2.1
   rejection risk). Either paste freshly issued capped keys or remove the
   key lines and keep the sentence that the "AI (free)" category needs no
   key.
6. Version release: "Automatically release this version". Submit for
   review (1.0.1 took two days).
7. After release, check the product page's "Languages" line, or
   `curl -s 'https://itunes.apple.com/lookup?id=6812582287&country=it'`
   for `languageCodesISO2A`. Done 2026-10-27, a few hours after the
   release at 01:31 UTC: `["EN","IT"]` in IT, US, GB and DE; the pages
   read "Italiano e Inglese" / "English and Italian"; promotional text and
   What's New present in both languages.

## Version 1.0.3 (prepared 2026-11-07)

**Why.** Three things the 1.0.2 page still gets wrong in Italy, found on
2026-11-07 while checking a visibility review:

1. The Italian subtitle is not set: the Italian page shows the English
   "Classic Italian card games" (localized subtitles do show on that page,
   WhatsApp's and Scopa Più's among them). The Italian keywords look unset
   too: in Apple's search API no word that is only on the Italian list
   (`primiera`, 8 results; `piacentine`, 15; `multigiocatore`; `sarde`, 0)
   ever returns the app, while words only on the English list do
   ("scopa claude" 1st of 2, "scopa trick" 5th of 13). Both fields change
   only with a new version.
2. The first three screenshots are dark, carry no caption, and open with the
   opponent picker (token prices included) and two reasoning pop-ups over a
   dimmed board. The three top rivals open with a bright table, big cards
   and a slogan.
3. The preview videos never shipped (`local/apppreview/out/`), and "no
   ads" — the top complaint about rivals: 129 of 396 recent Italian reviews
   at three stars or below across 11 Scopa apps mention ads — appears only
   in the promotional text and the description, which search ignores.

**Check first in App Store Connect (five minutes).** App Information →
Localizable Information → Italian: Name and Subtitle (expected: Subtitle
empty). App Store → 1.0.2 → Italian → Keywords (expected: empty, or not
the drafted list). The promotional text is editable without a version:
paste the two texts below right away.

**Metadata, Italian** (Name and Subtitle under App Information, the rest on
the version page):

- **Name (30)**: `Scopa e Briscola: Carte Online` (30; the name is the
  strongest search field — "carte online" and "scopa online" are what
  people type, "AI" only helps for "scopa ai", which already ranks 2nd)
- **Subtitle (30)**: `Offline e senza pubblicità` (26; alternative, as a
  sentence: `Gioca a carte senza pubblicità`, 30, but it repeats "carte")
- **Keywords (100)**: `napoletane,siciliane,piacentine,sarde,gratis,multigiocatore,settebello,primiera,giochi,italiane` (95; "online" and "carte" moved into
  the name, "offline" into the subtitle, "gpt" dropped since the English
  list is indexed in Italy too; "gratis" stays in the keywords only — a price
  word in a name, subtitle or screenshot is a 2.3.7 rejection)
- **Promotional text (170)**: `Senza pubblicità e senza account. Gioca a Scopa e Briscola contro la CPU, i tuoi modelli IA (GPT, Claude, Gemini, OpenRouter) o gli amici online, anche offline.` (160)
- **What's New**: `Piccole correzioni.` (replace with the real changes if
  build 9 carries any)

**Metadata, English:**

- **Name**: unchanged, `Scopa & Briscola AI`
- **Subtitle (30)**: `Italian card games, no ads` (26; was `Classic Italian
  card games`)
- **Keywords**: unchanged
- **Promotional text (170)**: `No ads, no account. Play Scopa and Briscola against smart CPU bots, your own AI models (GPT, Claude, Gemini, OpenRouter) or friends online. Works offline too.` (158)
- **What's New**: `Small fixes.`

The home-screen name stays "Scopa AI" (`CFBundleDisplayName`); the Italian
name shows wherever the device language is Italian, in every storefront.

**Screenshots (both languages; iPhone 6.9" and iPad 13" rendered, 6.5" and
12.9" derived).** `local/appstore/shots.py <en|it>` captures the raw views
from the dev server (`npm run dev`, localhost:5173) at the device viewports
with OpenRouter mocked (the mock writes its reasoning in the interface
language); `local/appstore/compose.py <en|it>` sets each view on a felt
background under a caption (San Francisco, drawn by a headless browser) and
writes `local/appstore/screenshots-1.0.3/<lang>/<device>/`, with a contact
sheet per device. Eight per device, upload in file order:

| File | View | Caption EN | Caption IT |
|---|---|---|---|
| 01-no-ads | Scopa board mid-game | No ads. No account. / Just open and play | Senza pubblicità. Senza account. / Apri e gioca |
| 02-decks | the six decks (king of coins + knight of cups of each, from `public/cards/`) | Six regional decks | Sei mazzi regionali |
| 03-opponents | Scopa start screen, opponent picker | CPU bots or AI models / GPT, Claude, Gemini, Apple Intelligence | CPU o modelli IA / GPT, Claude, Gemini, Apple Intelligence |
| 04-ai-reasoning | Scopa reasoning pop-up | The AI explains its move / After every play | L'IA spiega la sua mossa / Dopo ogni giocata |
| 05-analysis | Scopa board with the win-odds panel and per-card numbers | Live odds for every card / Learn as you play | Le probabilità di ogni carta / Impara giocando |
| 06-briscola | Briscola board | Play Briscola too / Single round or best-of match | Gioca anche a Briscola / Mano secca o al meglio di tre |
| 07-briscola-reasoning | Briscola reasoning pop-up | Learn from every move / Reasoning in plain words | Impara da ogni mossa / Il ragionamento in parole semplici |
| 08-offline | Choose-a-game screen | Works offline / Online with friends too | Funziona anche offline / E online con gli amici |

**Preview videos**: `local/apppreview/out/app-preview-iphone-6.9.mp4` (EN)
and `app-preview-iphone-6.9-it.mp4` (IT), 886×1920, 29 s; upload each under
its language with the device "iPhone with Dynamic Island (medium display)"
(that size covers every Dynamic Island model).

**Build 9** (uploaded 2026-11-07 20:23): `ios/Signing.xcconfig` at
`MARKETING_VERSION = 1.0.3`, `CURRENT_PROJECT_VERSION = 9` (ed1c10c);
`npm run ios:release` archived `ios/build-release/App.xcarchive` = 1.0.3 (9),
`net.vvlabs.scopa`, en.lproj + it.lproj, the current web bundle (the app's
only change since build 8 is the store-badge code, hidden in the app, so
What's New stays generic). The first export failed with `exportArchive
Unable to process request - PLA Update available` / `No signing certificate
"iOS Distribution" found`: Apple's Program License Agreement of 2026-10-29
(LYL262) was pending, and the developer portal refuses cloud-signing requests
until the Account Holder accepts it at https://developer.apple.com/account.
Accepted the same evening (its one substantive change: the prohibited-conduct
list of Section 3.2(e) grew from two to seven items, all consistent with the
app's disclosures); `npm run ios:release -- --no-sync --upload` then went
through ("Upload succeeded", processing). Pre-submission check once
processed: TestFlight → iOS Builds → 1.0.3 (9) → Store Information →
Localizations must read "English, Italian". A version with new metadata
needs a build even without code changes.

**Website (committed 013e41f and deployed to both sites 2026-11-07).** Google's
"Get it on Google Play" badge next to the App Store badge on both start
screens (`src/components/UI/StoreBadges.tsx`, `public/badges/google-play-
badge-{en,it}.png` from Google's badge generator, unmodified), linking to
the Android app `net.vovchenko.scopaai` (500+ installs on Google Play as of
2026-11-07; Android is 62% of Italian phones, StatCounter October 2026).
Shown to Android and desktop visitors, hidden for iPhone and iPad visitors,
inside the iOS app, and when the page runs as an installed app (the Play
Store app itself, a home-screen PWA); Google's trademark line joins
Apple's in the footer. Redeploy with `sh local/contabo.sh`.

**App Store Connect steps for 1.0.3:**

1. Now: paste the two promotional texts (1.0.2, editable).
2. Create version 1.0.3. English (U.S.): subtitle, What's New. Italian:
   name and subtitle under App Information, keywords and What's New on the
   version page (check the description and support/marketing URLs carried
   over).
3. Screenshots, per language: remove the 2026-10 sets, upload the eight
   files of `iphone-6.9` and `ipad-13` (the 6.5" and 12.9" sets only if the
   form still asks for them).
4. App previews, per language (step above). Processing takes minutes;
   choose the poster frame.
5. Select build 9. Review notes: keep, after checking the keys in them are
   live (see "Version 1.0.2", step 5).
6. Submit for review ("Automatically release this version").
7. After release: the Italian page's subtitle (`curl -sL -A Mozilla/5.0
   https://apps.apple.com/it/app/id6812582287 | grep -o 'Offline e senza
   pubblicità'`), the videos on both pages, and "scopa primiera" in the
   Italian store (the app should appear among the handful of results).
