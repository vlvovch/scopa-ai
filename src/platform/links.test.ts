import { describe, it, expect } from 'vitest';
import { APP_STORE_URL, GOOGLE_PLAY_URL, inviteUrl, parseIncomingLink, pathForIncomingLink, showsAppStoreBadge, showsGooglePlayBadge } from './links';

describe('inviteUrl', () => {
  it('uses the page origin on the website', () => {
    expect(inviteUrl('SCOPA-AB12', { native: false, origin: 'https://scopa-ai.vovchenko.net' })).toBe(
      'https://scopa-ai.vovchenko.net/join/SCOPA-AB12'
    );
    expect(inviteUrl('BRISCOLA-AB12', { native: false, origin: 'https://playscopa.net' })).toBe(
      'https://playscopa.net/join/BRISCOLA-AB12'
    );
  });

  it("uses each game's public domain in the native app", () => {
    expect(inviteUrl('SCOPA-AB12', { native: true })).toBe('https://playscopa.net/join/SCOPA-AB12');
    expect(inviteUrl('BRISCOLA-AB12', { native: true })).toBe('https://playbriscola.com/join/BRISCOLA-AB12');
  });
});

describe('parseIncomingLink', () => {
  it('reads universal links, the query form and the custom scheme', () => {
    expect(parseIncomingLink('https://playscopa.net/join/briscola-ab12')).toEqual({ joinCode: 'BRISCOLA-AB12', game: null });
    expect(parseIncomingLink('https://playbriscola.com/?join=scopa-zz99')).toEqual({ joinCode: 'SCOPA-ZZ99', game: null });
    expect(parseIncomingLink('playscopa://join/BRISCOLA-AB12')).toEqual({ joinCode: 'BRISCOLA-AB12', game: null });
    expect(parseIncomingLink('playscopa:///join/SCOPA-AB12')).toEqual({ joinCode: 'SCOPA-AB12', game: null });
  });

  it('reads game links and ignores everything else', () => {
    expect(parseIncomingLink('https://playscopa.net/briscola')).toEqual({ joinCode: null, game: 'briscola' });
    expect(parseIncomingLink('playscopa://scopa')).toEqual({ joinCode: null, game: 'scopa' });
    expect(parseIncomingLink('https://playscopa.net/?game=briscola')).toEqual({ joinCode: null, game: 'briscola' });
    expect(parseIncomingLink('https://playscopa.net/privacy.html')).toEqual({ joinCode: null, game: null });
    expect(parseIncomingLink('not a url')).toEqual({ joinCode: null, game: null });
    expect(parseIncomingLink(undefined)).toEqual({ joinCode: null, game: null });
  });

  it('maps a link to the in-app path the router understands', () => {
    expect(pathForIncomingLink({ joinCode: 'SCOPA-AB12', game: null })).toBe('/join/SCOPA-AB12');
    expect(pathForIncomingLink({ joinCode: null, game: 'briscola' })).toBe('/briscola');
    expect(pathForIncomingLink({ joinCode: null, game: null })).toBeNull();
  });
});

describe('the App Store badge', () => {
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
  const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
  const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

  it('links to the app by its Apple ID', () => {
    expect(APP_STORE_URL).toBe('https://apps.apple.com/app/id6812582287');
  });

  it('shows on the website for iPhone, iPad and desktop visitors', () => {
    expect(showsAppStoreBadge(false, IPHONE)).toBe(true);
    expect(showsAppStoreBadge(false, MAC)).toBe(true);
    expect(showsAppStoreBadge(false, '')).toBe(true);
  });

  it('is hidden inside the app itself and on Android (the Play Store app included)', () => {
    expect(showsAppStoreBadge(true, IPHONE)).toBe(false);
    expect(showsAppStoreBadge(false, ANDROID)).toBe(false);
  });
});

describe('the Google Play badge', () => {
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
  const IPAD = 'Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
  const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
  const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

  it('links to the Android app by its package name', () => {
    expect(GOOGLE_PLAY_URL).toBe('https://play.google.com/store/apps/details?id=net.vovchenko.scopaai');
  });

  it('shows on the website for Android and desktop visitors', () => {
    expect(showsGooglePlayBadge(false, ANDROID, false)).toBe(true);
    expect(showsGooglePlayBadge(false, MAC, false)).toBe(true);
    expect(showsGooglePlayBadge(false, '', false)).toBe(true);
  });

  it('is hidden for iPhone and iPad visitors, inside the iOS app, and when the page runs as an installed app', () => {
    expect(showsGooglePlayBadge(false, IPHONE, false)).toBe(false);
    expect(showsGooglePlayBadge(false, IPAD, false)).toBe(false);
    expect(showsGooglePlayBadge(true, ANDROID, false)).toBe(false);
    expect(showsGooglePlayBadge(false, ANDROID, true)).toBe(false);
  });
});
