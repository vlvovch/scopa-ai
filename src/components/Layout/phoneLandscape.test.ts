import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PHONE_LANDSCAPE_QUERY, SHORT_LANDSCAPE_QUERY, phoneLandscapeQuery } from './phoneLandscape';

const SRC = fileURLToPath(new URL('../..', import.meta.url));

function stylesheets(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return stylesheets(path);
    return entry.name.endsWith('.css') ? [path] : [];
  });
}

/** Every media query of a short landscape window, with the stylesheet it is in. */
function landscapeQueries(): { file: string; query: string }[] {
  return stylesheets(SRC).flatMap((path) =>
    [...readFileSync(path, 'utf8').matchAll(/@media([^{]+)\{/g)]
      .map((match) => match[1].replace(/\s+/g, ' ').trim())
      .filter((query) => query.includes('orientation: landscape') && query.includes('max-height'))
      .map((query) => ({ file: relative(SRC, path), query })),
  );
}

describe('phone landscape layout', () => {
  it('is selected by the same media query in every stylesheet', () => {
    const queries = landscapeQueries();
    const steps = [PHONE_LANDSCAPE_QUERY, phoneLandscapeQuery(400)];
    expect(queries.filter(({ query }) => !steps.includes(query))).toEqual([]);
    // The stylesheets known to have rules for it: a rename or a typo that
    // drops one out of the search above would otherwise pass unnoticed.
    expect(new Set(queries.map(({ file }) => file))).toEqual(new Set([
      'index.css',
      'components/Layout/GameLayout.module.css',
      'components/Table/CapturedPile.module.css',
      'components/Table/DealerDeck.module.css',
      'components/Table/PlayerHand.module.css',
      'components/Table/TableCards.module.css',
      'components/UI/GameControls.module.css',
      'components/UI/RoundEndScreen.module.css',
      'components/UI/ScoreBoard.module.css',
    ]));
  });

  it('has a step for the shortest screens in index.css only', () => {
    const shortest = landscapeQueries().filter(({ query }) => query === phoneLandscapeQuery(400));
    expect(shortest.map(({ file }) => file)).toEqual(['index.css']);
  });

  it('takes narrow windows and touch screens of that height, not wide desktop windows', () => {
    const [narrow, touch] = PHONE_LANDSCAPE_QUERY.split(', ');
    expect(narrow).toBe('(max-height: 500px) and (max-width: 960px) and (orientation: landscape)');
    expect(touch).toBe('(max-height: 500px) and (pointer: coarse) and (orientation: landscape)');
  });

  it('shares its height limit with the query for any short landscape window', () => {
    expect(SHORT_LANDSCAPE_QUERY).toBe('(orientation: landscape) and (max-height: 500px)');
    expect(PHONE_LANDSCAPE_QUERY).toContain('(max-height: 500px)');
  });
});
