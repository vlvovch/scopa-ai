import { describe, it, expect } from 'vitest';
import { inviteUrl, parseIncomingLink, pathForIncomingLink } from './links';

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
