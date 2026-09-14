import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { stripWebOnlyBlocks } from './webOnlyHtml';

describe('stripWebOnlyBlocks (native index.html)', () => {
  it('removes every fenced block and keeps the rest', () => {
    const html = 'a\n  <!-- @web-only:start -->\n  <script>x</script>\n  <!-- @web-only:end -->\nb\n<!-- @web-only:start -->c<!-- @web-only:end -->\nd\n';
    expect(stripWebOnlyBlocks(html)).toBe('a\nb\nd\n');
  });

  it("throws if a service-worker registration is outside a fence", () => {
    expect(() => stripWebOnlyBlocks("<script>navigator.serviceWorker.register('/sw.js')</script>")).toThrow(/service-worker/);
  });

  it('throws on an unbalanced fence', () => {
    expect(() => stripWebOnlyBlocks('<!-- @web-only:start -->\n<script>')).toThrow(/unbalanced/);
  });

  it("strips the real index.html of its service worker, update flow and analytics", () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    const out = stripWebOnlyBlocks(html);
    for (const marker of ['serviceWorker', 'sw-updated', '__swUpdated', 'swetrix', 'appinstalled']) {
      expect(out, marker).not.toContain(marker);
    }
    // what the app still needs
    expect(out).toContain('id="root"');
    expect(out).toContain('/src/main.tsx');
    expect(out).toContain('--font-scale');
    expect(out).toContain('viewport-fit=cover');
  });
});
