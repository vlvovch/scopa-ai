import { describe, it, expect } from 'vitest';
import { sanitizePagePath, sanitizeQueryString, sanitizePageview, invitePathFromQuery } from './sanitize';

describe('sanitizePagePath', () => {
  it('normalises invite paths to /join', () => {
    expect(sanitizePagePath('/join/SCOPA-AB12')).toBe('/join');
    expect(sanitizePagePath('/join/BRISCOLA-AB12')).toBe('/join');
    expect(sanitizePagePath('/join/briscola-ab12/')).toBe('/join');
    expect(sanitizePagePath('/JOIN/SCOPA-AB12')).toBe('/join');
    expect(sanitizePagePath('/join/')).toBe('/join');
    expect(sanitizePagePath('/join')).toBe('/join');
  });
  it('leaves every other path alone', () => {
    for (const p of ['/', '/briscola', '/scopa', '/rules', '/privacy.html']) expect(sanitizePagePath(p)).toBe(p);
    expect(sanitizePagePath('')).toBe('');
    expect(sanitizePagePath(undefined)).toBe('');
  });
});

describe('sanitizeQueryString', () => {
  it('drops invite parameters by name and by value, keeps the rest in order', () => {
    expect(sanitizeQueryString('join=SCOPA-AB12')).toBeUndefined();
    expect(sanitizeQueryString('utm_source=x&join=BRISCOLA-AB12&utm_medium=y')).toBe('utm_source=x&utm_medium=y');
    expect(sanitizeQueryString('JOIN=scopa-ab12')).toBeUndefined();
    expect(sanitizeQueryString('code=SCOPA-AB12&room=BRISCOLA-9Z9Z')).toBeUndefined();
    expect(sanitizeQueryString('ref=SCOPA-AB12')).toBeUndefined();          // a room code under any name
    expect(sanitizeQueryString('ref=friend&x=%20SCOPA-AB12')).toBe('ref=friend');
  });
  it('keeps ordinary queries and tolerates junk', () => {
    expect(sanitizeQueryString('utm_source=newsletter')).toBe('utm_source=newsletter');
    expect(sanitizeQueryString('a=%E0%A4%A&b=1')).toBe('a=%E0%A4%A&b=1');
    expect(sanitizeQueryString('')).toBe('');
    expect(sanitizeQueryString(undefined)).toBeUndefined();
  });
});

describe('sanitizePageview', () => {
  it('rewrites only the path and the query, never leaving an empty path', () => {
    expect(sanitizePageview({ pg: '/join/SCOPA-AB12', qs: 'join=SCOPA-AB12' })).toEqual({ pg: '/join', qs: undefined });
    expect(sanitizePageview({ pg: '/briscola', qs: 'utm_source=a' })).toEqual({ pg: '/briscola', qs: 'utm_source=a' });
    expect(sanitizePageview({})).toEqual({ pg: '/', qs: undefined });
  });
});

describe('invitePathFromQuery', () => {
  it('turns a ?join= invitation into the path form and ignores everything else', () => {
    expect(invitePathFromQuery('?join=SCOPA-AB12')).toBe('/join/SCOPA-AB12');
    expect(invitePathFromQuery('?utm_source=x&join=briscola-ab12')).toBe('/join/BRISCOLA-AB12');
    expect(invitePathFromQuery('?join=')).toBeNull();
    expect(invitePathFromQuery('?join=not a code')).toBeNull();
    expect(invitePathFromQuery('?utm_source=x')).toBeNull();
    expect(invitePathFromQuery('')).toBeNull();
  });
});
