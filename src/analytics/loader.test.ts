// The loader: no tag is created unless the gate allows it, settings are
// read defensively, and the tag that is created initialises the client
// the same way the inline snippet did (plus devMode for the native app,
// whose web view lives at capacitor://localhost).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readAnalyticsConfig, startAnalytics, type AnalyticsConfig, type AnalyticsWindow } from './loader';
import type { AnalyticsEnvironment } from './gate';

type FakeScript = { tag: string; src?: string; async?: boolean; onload?: () => void };

function fakeDocument() {
  const appended: FakeScript[] = [];
  const doc = {
    createElement: (tag: string): FakeScript => ({ tag }),
    head: { appendChild(el: FakeScript) { appended.push(el); } },
  };
  return { doc: doc as unknown as Document, appended };
}

const PROD_SITE: AnalyticsEnvironment = { prod: true, protocol: 'https:', hostname: 'playscopa.net', native: false };
const RELEASE_DEVICE: AnalyticsEnvironment = {
  prod: true, protocol: 'capacitor:', hostname: 'localhost', native: true,
  nativeBuild: { configuration: 'Release', debug: false, simulator: false },
};
const CONFIG: AnalyticsConfig = {
  swetrix: { scriptUrl: 'https://cdn.example.org/swetrix.js', apiUrl: 'https://api.example.org/log', projectId: 'TESTPROJECT0' },
};

afterEach(() => vi.restoreAllMocks());

describe('readAnalyticsConfig', () => {
  it('needs every Swetrix value, tolerates blanks, ignores unrelated keys', () => {
    expect(readAnalyticsConfig({})).toEqual({ swetrix: null });
    expect(readAnalyticsConfig({ VITE_SWETRIX_SCRIPT_URL: 'a', VITE_SWETRIX_API_URL: 'b', VITE_SWETRIX_PROJECT_ID: '' }).swetrix).toBeNull();
    expect(readAnalyticsConfig({ VITE_SWETRIX_SCRIPT_URL: 'a', VITE_SWETRIX_PROJECT_ID: 'c' }).swetrix).toBeNull();
    expect(readAnalyticsConfig({ VITE_SWETRIX_SCRIPT_URL: ' a ', VITE_SWETRIX_API_URL: 'b', VITE_SWETRIX_PROJECT_ID: 'c', PROD: true }).swetrix)
      .toEqual({ scriptUrl: 'a', apiUrl: 'b', projectId: 'c' });
  });
});

describe('startAnalytics', () => {
  it('creates no tag at all when the gate says no, and says why', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { doc, appended } = fakeDocument();
    for (const environment of [
      { ...PROD_SITE, prod: false },
      { ...PROD_SITE, hostname: 'localhost' },
      { ...RELEASE_DEVICE, nativeBuild: { configuration: 'Debug', debug: true, simulator: true } },
      { ...RELEASE_DEVICE, nativeBuild: { configuration: 'Debug', debug: true, simulator: false } },
      { ...RELEASE_DEVICE, nativeBuild: null },
    ] as AnalyticsEnvironment[]) {
      expect(startAnalytics({ environment, config: CONFIG, doc, win: {} }).enabled).toBe(false);
    }
    expect(appended).toHaveLength(0);
    expect(info.mock.calls.map((c) => c[0])).toEqual([
      '[analytics] off: not a production build',
      '[analytics] off: development host (localhost)',
      '[analytics] off: iOS Simulator',
      '[analytics] off: native Debug build',
      '[analytics] off: native build information unavailable',
    ]);
  });

  it('loads nothing without settings even where the gate says yes', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { doc, appended } = fakeDocument();
    expect(startAnalytics({ environment: PROD_SITE, config: { swetrix: null }, doc, win: {} }).enabled).toBe(true);
    expect(startAnalytics({ environment: RELEASE_DEVICE, config: { swetrix: null }, doc, win: {} }).enabled).toBe(true);
    expect(appended).toHaveLength(0);
    expect(info).toHaveBeenCalledWith('[analytics] off: no provider configured');
  });

  it('on the website loads the tag and initialises the client like the inline snippet did', () => {
    const { doc, appended } = fakeDocument();
    const init = vi.fn();
    const trackViews = vi.fn();
    const win: AnalyticsWindow = {};
    expect(startAnalytics({ environment: PROD_SITE, config: CONFIG, doc, win })).toEqual({ enabled: true, reason: 'production' });
    expect(appended.map((s) => [s.tag, s.src, s.async])).toEqual([['script', CONFIG.swetrix!.scriptUrl, true]]);
    // initialises once the script has loaded, then opens the event gate
    expect(win.__swetrixReady).toBeUndefined();
    win.swetrix = { init, trackViews };
    appended[0].onload?.();
    expect(init).toHaveBeenCalledWith('TESTPROJECT0', { apiURL: 'https://api.example.org/log', respectDNT: true, devMode: false });
    expect(trackViews).toHaveBeenCalledTimes(1);
    expect(win.__swetrixReady).toBe(true);
    // the pageview callback strips room codes from what the client sends
    const { callback } = trackViews.mock.calls[0][0];
    expect(callback({ pg: '/join/SCOPA-AB12', qs: 'utm_source=x&join=SCOPA-AB12' })).toEqual({ pg: '/join', qs: 'utm_source=x' });
    expect(callback({ pg: '/briscola', qs: undefined })).toEqual({ pg: '/briscola', qs: undefined });
  });

  it('in the native app (a Release build on a device) sets devMode so the client accepts capacitor://localhost', () => {
    const { doc, appended } = fakeDocument();
    const init = vi.fn();
    const win: AnalyticsWindow = {};
    expect(startAnalytics({ environment: RELEASE_DEVICE, config: CONFIG, doc, win }).enabled).toBe(true);
    win.swetrix = { init, trackViews: vi.fn() };
    appended[0].onload?.();
    expect(init).toHaveBeenCalledWith('TESTPROJECT0', { apiURL: 'https://api.example.org/log', respectDNT: true, devMode: true });
    expect(win.__swetrixReady).toBe(true);
  });

  it('keeps the event gate closed when the script never exposes init', () => {
    const { doc, appended } = fakeDocument();
    const win: AnalyticsWindow = {};
    startAnalytics({ environment: PROD_SITE, config: CONFIG, doc, win });
    appended[0].onload?.();
    expect(win.__swetrixReady).toBeUndefined();
  });
});
