# Analytics gate

Which copies of the app may talk to Swetrix, how that is decided, and how
it is verified without ever touching the production project. Swetrix
(cookieless, no persistent identifiers, see `public/privacy.html`) is the
only analytics provider; the older Umami and Plausible tags are gone.

## Configuration

| Setting | Website | Native app (`.env.ios`) |
|---|---|---|
| `VITE_SWETRIX_SCRIPT_URL` | `.env.local` / `.env.production` on the build machine (not committed) | `https://swetrix.org/swetrix.js` |
| `VITE_SWETRIX_API_URL` | same | the website's API URL: `https://swetrix-api.vvlabs.net/log` since 2026-09-19 (was `swetrix-api.vovchenko.net`; the dashboard is `swetrix.vvlabs.net`, which is not the API) |
| `VITE_SWETRIX_PROJECT_ID` | Scopa and Briscola sites each have their own project (`.env.local`, `.env.briscola.local`) | the Scopa project; every gameplay event carries `game` |

Vite loads `.env.local` for every mode, the dev server included, so the
production id is present in development bundles: that is why the client
needs a gate and cannot rely on "no configuration". The project id is
public by nature (it is in the website's page), which is why `.env.ios`
can carry it.

`index.html` contains no analytics tag. `src/analytics/loader.ts` creates
the `<script>` tag at runtime, after the gate below said yes, and
initialises the client the way the inline snippet used to
(`swetrix.init` with `respectDNT`, `trackViews`, then
`window.__swetrixReady` for the gameplay events of
`src/analytics/events.ts`). Empty settings simply mean nothing is loaded.

## The gate (`src/analytics/gate.ts`)

Several independent signals must agree, and a missing signal counts as
"no". Vite's production flag is required but never sufficient.

| Situation | Decision |
|---|---|
| Dev server (`npm run dev`), whatever the host | off: not a production build |
| Production flag unknown | off |
| Production build on `localhost`, `127.0.0.1`, `[::1]`, `*.localhost`, `*.test`, `*.local`, `*.example`, `*.internal`, a bare IPv4/IPv6 address (`vite preview`, LAN testing, Playwright) | off: development host |
| Production build not served over http(s) (`file:`) | off |
| Production build on a public host over http(s) | **on** |
| Native app: the shell reported no build information | off: native build information unavailable |
| Native app: running in the iOS Simulator | off: iOS Simulator |
| Native app: compiled with `DEBUG` (the Debug configuration) | off: native Debug build |
| Native app: any configuration other than `Release` | off |
| Native app: `Release`, no `DEBUG`, real device | **on** |

Whatever the server side accepts is irrelevant: Swetrix can be configured
to accept localhost traffic, but the client never sends from those
environments in the first place. The decision is printed once at start-up
when it is negative (`[analytics] off: <reason>`), which is also the
evidence the verification below collects.

The Swetrix client has guards of its own: it skips under
`navigator.webdriver`, with Do Not Track, and on the literal hosts
`localhost` / `127.0.0.1` unless initialised with `devMode`. The website
never sets `devMode` (one more layer under the gate). The native app must
set it, because its web view lives at `capacitor://localhost`; the loader
does so only once the gate has established a Release build on a device.

## Native build information

`ios/App/App/BuildInfoPlugin.swift` (registered in `MainViewController`)
reports three values, none of which the web bundle can influence:

- `debug`: the `DEBUG` compilation condition (`SWIFT_ACTIVE_COMPILATION_CONDITIONS`
  of the Debug configuration);
- `simulator`: compiled for the Simulator (`targetEnvironment(simulator)`)
  or running under it (`SIMULATOR_*` in the process environment);
- `configuration`: the Xcode configuration name, written into Info.plist
  as `AppBuildConfiguration = $(CONFIGURATION)` at build time.

`src/platform/buildInfo.ts` validates the report strictly (wrong types,
a rejected call or a missing plugin all become "unavailable"), and
`bootstrapNative()` logs it as `[native] build info: {...}`.

## What is sent, and the privacy declarations

Every gameplay event carries `platform` (`ios` for the Capacitor app,
`android` for the Trusted Web Activity or the site installed on Android,
`web` otherwise; `src/analytics/platform.ts`) next to the game, mode and
opponent kind.

Invitation URLs name a room a stranger could enter, so they never leave
the device: the Swetrix pageview callback (`src/analytics/sanitize.ts`)
rewrites `/join/SCOPA-AB12` to `/join` and drops invite parameters from
the query it copies from the address bar, and the client reuses the
rewritten path for the custom events that follow. Custom events also
copy the raw query string, which the callback cannot reach, so the entry
point (`src/main.tsx`) rewrites the older `/?join=CODE` link form to the
path form before the app renders; campaign parameters are kept.

The native app's privacy manifest (`ios/App/App/PrivacyInfo.xcprivacy`)
declares three collected data types, all for analytics, not linked to
identity, not used for tracking, and the App Store Connect nutrition
labels must say the same:

| Declared | Why |
|---|---|
| Product interaction | pageviews and the gameplay events |
| Coarse location | the analytics server derives the country from the request's IP address (Swetrix keeps country level only; nothing finer is collected) |
| Performance data | the Swetrix client attaches page-load timings to the first pageview of a visit, and it cannot be told not to |

## Verifying: always against a separate test project

Never verify against the production project. The harness
(`e2e_analytics.py`, kept with the other Playwright scripts outside the
repo) does this:

1. Builds a **test bundle** with a test project id and the API URL of a
   capture server on this Mac
   (`VITE_SWETRIX_PROJECT_ID=<test id> VITE_SWETRIX_API_URL=https://capture.test:8899/log …
   vite build --mode scopa --outDir <dir>`); shell variables override the
   `.env` files. The Swetrix client script itself comes from the public
   CDN so the real client code runs. To use a real Swetrix test project
   instead of the capture server, create one in the Swetrix dashboard and
   put its id and API URL in the overrides; the production id must not
   appear in any override.
2. Serves the **real** production build (production id baked in) on
   `localhost`, `127.0.0.1`, a `*.test` host and the LAN address, and runs
   the dev server on `localhost` / `127.0.0.1`. Playwright records every
   request the pages make while a game is started: there must be none to
   the Swetrix API, the CDN, the capture server, or carrying either
   project id, and the console must show the gate's reason.
3. Serves the test bundle on a public-looking host that the browser
   resolves locally (`verify.playscopa.net → 127.0.0.1`), with the
   automation flag hidden (`--disable-blink-features=AutomationControlled`,
   otherwise the client itself refuses): the capture server must receive
   the pageview (`/log/`), the heartbeat and a `GAME_STARTED` event, every
   payload carrying the test id only. The same bundle on a `*.test` host
   must stay silent (configuration present, gate closed).
4. Builds the **native** bundle with the same test overrides, runs the
   Debug build in the Simulator with the console attached, and expects
   `[native] build info: {"configuration":"Debug","debug":true,"simulator":true}`
   followed by `[analytics] off: iOS Simulator`, no script load, nothing
   at the capture server. Then restores the real bundle (`npm run
   ios:sync`, `.env.ios` with the production settings), rebuilds, and
   expects the same silence from the Simulator with the real settings.

Unit tests: `src/analytics/gate.test.ts` (decision table),
`src/analytics/loader.test.ts` (no tag unless allowed; init options for
the website and for the native app), `src/platform/buildInfo.test.ts`
(report validation).

A Release build on a real device is the one case that sends, and it
cannot be exercised on this machine (no signing identity); it is covered
by the unit tests of the gate and the loader.

## Verification record (2026-09-13)

Run on this Mac against the capture server and the test id
`TESTPROJECT0`; the production id was present only in the negative
checks (real builds with the real settings) and appeared in no request.

| Environment | Gate says | Analytics requests observed |
|---|---|---|
| `vite` dev server, `localhost` and `127.0.0.1`, production id in the served module | off: not a production build | none |
| Real production build, `vite preview` on `localhost` and `127.0.0.1` | off: development host | none |
| Real production build on `https://scopa.test` (Playwright-style host) | off: development host | none |
| Real production build on the LAN address (`http://192.168.x.x`) | off: development host | none |
| Test build on `https://scopa.test` (settings present) | off: development host | none |
| Test build on `https://verify.playscopa.net` (resolved locally) | on | pageview (`/log/`), heartbeat and `GAME_STARTED` at the capture server, all with the test id; the real client script from the CDN; nothing else |
| Native Debug build in the iOS Simulator, test settings baked in | off: iOS Simulator (report: `Debug`, `DEBUG`, simulator) | none in the console, nothing at the capture server |
| Native Debug build in the iOS Simulator, the real `.env.ios` settings (production id in the bundle) | off: iOS Simulator | none |
| Test build, fresh visitor on `/join/SCOPA-AB12` and on `/?join=SCOPA-CD34&utm_source=verify` | on | pageviews and custom events with `pg: /join`, no room code in any payload, `qs: utm_source=verify` kept; the `?join=` address rewritten to `/join/SCOPA-CD34?utm_source=verify` before the app rendered |

58 browser checks (dev server, preview, positive control) and 17 native
checks, all passing; 359 unit tests (`npm test`). `GAME_STARTED` payloads
carry `platform: web` on the website.
