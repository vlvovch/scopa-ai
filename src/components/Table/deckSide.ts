// Which side of the table the deck sits on.
//
// By default the dealer's: left when the opponent deals, right when the
// bottom player does. On the left the deck shares a column with the
// scoreboard above it and the bottom player's pile below it, and in a
// landscape window of limited height that column has no room: the deck's
// count ran into the label of the pile. On the right only the opponent's
// pile sits above it, so there the deck goes whenever the left is tight.
//
// The deck is one card tall plus its badge and count. Cards grow with the
// window height while the scoreboard and the labels grow with the text
// size, so the least window height that holds the deck on the left is
// about 270px + 330px × text size (measured at the four text sizes: 600,
// 666, 732 and 799px). The limit below adds a margin to that.
//
// The phone landscape layout (../Layout/phoneLandscape.ts) is as short as
// those windows but has no such column: the scoreboard and the piles stand
// beside the deck there. It keeps the dealer's side.

import { useMediaQuery } from '../../hooks/useMediaQuery';
import { PHONE_LANDSCAPE_QUERY } from '../Layout/phoneLandscape';

export type DeckSide = 'left' | 'right';

/** Media query for the windows too short to hold the deck on the left of the desktop layout. */
export function tightLeftColumnQuery(fontScale: number): string {
  const maxHeight = Math.round(300 + 330 * fontScale);
  return `(orientation: landscape) and (max-height: ${maxHeight}px)`;
}

/** Whether this window has no room for the deck on the left, at this text size. */
export function useTightLeftColumn(fontScale: number): boolean {
  const short = useMediaQuery(tightLeftColumnQuery(fontScale));
  const phoneLandscape = useMediaQuery(PHONE_LANDSCAPE_QUERY);
  return short && !phoneLandscape;
}

/** The deck's side: the dealer's, unless the left column is tight. */
export function deckSide(bottomPlayerDeals: boolean, tightLeftColumn: boolean): DeckSide {
  return bottomPlayerDeals || tightLeftColumn ? 'right' : 'left';
}
