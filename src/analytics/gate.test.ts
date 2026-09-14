// The environment gate: development, native Debug builds and the Simulator
// must never be allowed, and missing information must count as "no".
import { describe, it, expect } from 'vitest';
import { decideAnalytics, isDevelopmentHost, type AnalyticsEnvironment } from './gate';

const site = (over: Partial<AnalyticsEnvironment> = {}): AnalyticsEnvironment => ({
  prod: true, protocol: 'https:', hostname: 'playscopa.net', native: false, ...over,
});
const app = (over: Partial<AnalyticsEnvironment> = {}): AnalyticsEnvironment => ({
  prod: true, protocol: 'capacitor:', hostname: 'localhost', native: true,
  nativeBuild: { configuration: 'Release', debug: false, simulator: false }, ...over,
});

describe('isDevelopmentHost', () => {
  it('flags local, loopback, test and LAN hosts', () => {
    for (const h of ['localhost', 'LOCALHOST', '127.0.0.1', '0.0.0.0', '::1', '[::1]', 'scopa.test', 'app.localhost',
      'mac.local', 'dev.example', 'x.internal', '192.168.1.20', '10.0.0.5', 'fe80::1', '', ' ']) {
      expect(isDevelopmentHost(h), h).toBe(true);
    }
  });
  it('accepts the public sites', () => {
    for (const h of ['playscopa.net', 'playbriscola.com', 'scopa-ai.vovchenko.net', 'html-classic.itch.zone', 'playscopa.net.']) {
      expect(isDevelopmentHost(h), h).toBe(false);
    }
  });
});

describe('decideAnalytics on the website', () => {
  it('allows only a production build on a public host over http(s)', () => {
    expect(decideAnalytics(site())).toEqual({ enabled: true, reason: 'production' });
    expect(decideAnalytics(site({ protocol: 'http:' })).enabled).toBe(true);
  });
  it('refuses the dev server even on a public-looking host', () => {
    expect(decideAnalytics(site({ prod: false }))).toEqual({ enabled: false, reason: 'not a production build' });
    expect(decideAnalytics(site({ prod: false, hostname: 'localhost' })).enabled).toBe(false);
  });
  it('refuses when the production flag is unknown', () => {
    expect(decideAnalytics(site({ prod: undefined })).enabled).toBe(false);
  });
  it('refuses a production build served on a development host (vite preview, LAN, Playwright)', () => {
    for (const hostname of ['localhost', '127.0.0.1', 'scopa.test', '192.168.0.10', 'mac.local']) {
      const d = decideAnalytics(site({ hostname }));
      expect(d.enabled, hostname).toBe(false);
      expect(d.reason).toContain('development host');
    }
  });
  it('refuses pages not served over http(s)', () => {
    expect(decideAnalytics(site({ protocol: 'file:', hostname: '' })).enabled).toBe(false);
    expect(decideAnalytics(site({ protocol: '', hostname: '' })).enabled).toBe(false);
  });
});

describe('decideAnalytics in the native app', () => {
  it('allows only a Release build without DEBUG on a real device', () => {
    expect(decideAnalytics(app())).toEqual({ enabled: true, reason: 'production' });
  });
  it('refuses when the shell reported no build information', () => {
    expect(decideAnalytics(app({ nativeBuild: null }))).toEqual({ enabled: false, reason: 'native build information unavailable' });
    expect(decideAnalytics(app({ nativeBuild: undefined })).enabled).toBe(false);
  });
  it('refuses the Simulator whatever the configuration', () => {
    expect(decideAnalytics(app({ nativeBuild: { configuration: 'Release', debug: false, simulator: true } })))
      .toEqual({ enabled: false, reason: 'iOS Simulator' });
    expect(decideAnalytics(app({ nativeBuild: { configuration: 'Debug', debug: true, simulator: true } })).reason).toBe('iOS Simulator');
  });
  it('refuses Debug builds on a device', () => {
    expect(decideAnalytics(app({ nativeBuild: { configuration: 'Debug', debug: true, simulator: false } })))
      .toEqual({ enabled: false, reason: 'native Debug build' });
    // a Release-named configuration that still compiles DEBUG is not production either
    expect(decideAnalytics(app({ nativeBuild: { configuration: 'Release', debug: true, simulator: false } })).reason).toBe('native Debug build');
  });
  it('refuses unknown or custom configurations', () => {
    expect(decideAnalytics(app({ nativeBuild: { configuration: '', debug: false, simulator: false } })).reason).toBe('native unknown configuration');
    expect(decideAnalytics(app({ nativeBuild: { configuration: 'Staging', debug: false, simulator: false } })).reason).toBe('native Staging configuration');
  });
  it('never lets the native path bypass the production-build flag', () => {
    expect(decideAnalytics(app({ prod: false })).reason).toBe('not a production build');
  });
  it('ignores the web-view origin: capacitor://localhost is not a development host for the app', () => {
    expect(decideAnalytics(app({ protocol: 'capacitor:', hostname: 'localhost' })).enabled).toBe(true);
  });
});
