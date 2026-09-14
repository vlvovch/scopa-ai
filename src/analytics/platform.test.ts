import { describe, it, expect } from 'vitest';
import { platformFromSignals, detectPlatform } from './platform';

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36';
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';

describe('platformFromSignals', () => {
  it('is ios for the native build whatever the browser signals say', () => {
    expect(platformFromSignals({ native: true, userAgent: ANDROID_UA, referrer: 'android-app://x', standalone: true })).toBe('ios');
    expect(platformFromSignals({ native: true, userAgent: '', referrer: '', standalone: false })).toBe('ios');
  });
  it('is android for the Trusted Web Activity (android-app referrer) or the site installed on Android', () => {
    expect(platformFromSignals({ native: false, userAgent: ANDROID_UA, referrer: 'android-app://net.vovchenko.scopa/', standalone: false })).toBe('android');
    expect(platformFromSignals({ native: false, userAgent: ANDROID_UA, referrer: '', standalone: true })).toBe('android');
  });
  it('is web for Android browsers, iOS Safari (installed or not) and desktops', () => {
    expect(platformFromSignals({ native: false, userAgent: ANDROID_UA, referrer: 'https://t.co/', standalone: false })).toBe('web');
    expect(platformFromSignals({ native: false, userAgent: IOS_UA, referrer: '', standalone: true })).toBe('web');
    expect(platformFromSignals({ native: false, userAgent: 'Mozilla/5.0 (Macintosh)', referrer: 'android-app://x', standalone: true })).toBe('web');
  });
});

describe('detectPlatform', () => {
  it('reports web in an environment without a browser', () => {
    expect(detectPlatform()).toBe('web');
  });
});
