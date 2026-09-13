// The card that stands for each game in the first-launch chooser and the
// "new game available" notice: the sette bello for Scopa, an ace — the top
// Briscola card — for Briscola (swords, so the two never read as one suit).
import type { GameId } from '../../games/gameSelection';
import type { Card } from '../../games/scopa/types';

export const SIGNATURE_CARD: Record<GameId, Card> = {
  scopa: { id: 'coins-7', suit: 'coins', value: 7 },
  briscola: { id: 'swords-1', suit: 'swords', value: 1 },
};
