// Phase 4: Game Rules Engine

import type { Card, GameState, Move, PlayerId } from './types';

/**
 * Step 4.1: Find all table cards that match a played card's value.
 * Returns array of matching cards (empty if none found).
 */
export function findSingleCaptures(playedCard: Card, tableCards: Card[]): Card[] {
  return tableCards.filter((card) => card.value === playedCard.value);
}

/**
 * Step 4.2: Find all combinations of table cards that sum to a played card's value.
 * Returns array of valid capture combinations (each with 2+ cards).
 */
export function findSumCaptures(playedCard: Card, tableCards: Card[]): Card[][] {
  const targetSum = playedCard.value;
  const results: Card[][] = [];

  // Generate all subsets of table cards
  function findSubsets(
    index: number,
    currentSum: number,
    currentSubset: Card[]
  ): void {
    // Valid combination: sum matches and has 2+ cards
    if (currentSum === targetSum && currentSubset.length >= 2) {
      results.push([...currentSubset]);
    }

    // Pruning: if sum already exceeds target, stop exploring
    if (currentSum >= targetSum) {
      return;
    }

    // Try adding each remaining card
    for (let i = index; i < tableCards.length; i++) {
      currentSubset.push(tableCards[i]);
      findSubsets(i + 1, currentSum + tableCards[i].value, currentSubset);
      currentSubset.pop();
    }
  }

  findSubsets(0, 0, []);
  return results;
}

/**
 * Step 4.3: Get all valid moves for a card played against the table.
 * Single card captures take priority over sum captures (mandatory rule).
 */
export function getValidMoves(
  card: Card,
  tableCards: Card[],
  player: PlayerId
): Move[] {
  const moves: Move[] = [];

  // Check for single card captures first (priority rule)
  const singleCaptures = findSingleCaptures(card, tableCards);

  if (singleCaptures.length > 0) {
    // Single card priority: only return single card capture options
    // If multiple cards match (same rank, different suits), player chooses one
    for (const capturedCard of singleCaptures) {
      const capturedCards = [capturedCard];
      const remainingTable = tableCards.filter((c) => c.id !== capturedCard.id);

      moves.push({
        player,
        cardPlayed: card,
        capturedCards,
        isScopa: remainingTable.length === 0,
      });
    }
    return moves;
  }

  // No single capture - check for sum captures
  const sumCaptures = findSumCaptures(card, tableCards);

  if (sumCaptures.length > 0) {
    for (const capturedCards of sumCaptures) {
      const capturedIds = new Set(capturedCards.map((c) => c.id));
      const remainingTable = tableCards.filter((c) => !capturedIds.has(c.id));

      moves.push({
        player,
        cardPlayed: card,
        capturedCards,
        isScopa: remainingTable.length === 0,
      });
    }
    return moves;
  }

  // No captures possible - must place the card
  moves.push({
    player,
    cardPlayed: card,
    capturedCards: [],
    isScopa: false,
  });

  return moves;
}

/**
 * Step 4.4: Validate if a proposed move is legal.
 */
export function isValidMove(
  move: Move,
  hand: Card[],
  tableCards: Card[]
): boolean {
  // Check that played card is in hand
  const cardInHand = hand.some((c) => c.id === move.cardPlayed.id);
  if (!cardInHand) {
    return false;
  }

  // Check that all captured cards are on table
  const tableIds = new Set(tableCards.map((c) => c.id));
  for (const captured of move.capturedCards) {
    if (!tableIds.has(captured.id)) {
      return false;
    }
  }

  // If placing (no capture), verify no capture was possible
  if (move.capturedCards.length === 0) {
    const possibleMoves = getValidMoves(move.cardPlayed, tableCards, move.player);
    const hasCapture = possibleMoves.some((m) => m.capturedCards.length > 0);
    if (hasCapture) {
      return false; // Mandatory capture rule violated
    }
    return true;
  }

  // Verify capture is valid
  if (move.capturedCards.length === 1) {
    // Single card capture: values must match
    return move.capturedCards[0].value === move.cardPlayed.value;
  } else {
    // Sum capture: sum of captured cards must equal played card value
    const sum = move.capturedCards.reduce((acc, c) => acc + c.value, 0);
    if (sum !== move.cardPlayed.value) {
      return false;
    }

    // Also verify single card priority wasn't violated
    const singleCaptures = findSingleCaptures(move.cardPlayed, tableCards);
    if (singleCaptures.length > 0) {
      return false; // Should have captured single card instead
    }

    return true;
  }
}

/**
 * Step 4.5: Execute a move and return the new game state.
 * Does not mutate the input state.
 */
export function executeMove(state: GameState, move: Move): GameState {
  const { player, cardPlayed, capturedCards, isScopa } = move;

  // Get current player state
  const playerState = state.players[player];

  // Remove played card from hand
  const newHand = playerState.hand.filter((c) => c.id !== cardPlayed.id);

  // Calculate new table and captured pile
  let newTable: Card[];
  let newCaptured: Card[];
  let newLastCapture: PlayerId | null = state.round.lastCapture;

  if (capturedCards.length > 0) {
    // Capture: remove captured cards from table, add all to captured pile
    const capturedIds = new Set(capturedCards.map((c) => c.id));
    newTable = state.round.table.filter((c) => !capturedIds.has(c.id));
    newCaptured = [...playerState.captured, cardPlayed, ...capturedCards];
    newLastCapture = player;
  } else {
    // Place: add card to table
    newTable = [...state.round.table, cardPlayed];
    newCaptured = playerState.captured;
  }

  // Update scopa count and track scopa captures if applicable
  const newScopaCount = isScopa ? playerState.scopaCount + 1 : playerState.scopaCount;
  const newScopaCaptures = isScopa
    ? [...playerState.scopaCaptures, [cardPlayed, ...capturedCards]]
    : playerState.scopaCaptures;

  // Switch to other player
  const nextPlayer: PlayerId = player === 'human' ? 'cpu' : 'human';

  // Build new state
  return {
    ...state,
    round: {
      ...state.round,
      table: newTable,
      currentPlayer: nextPlayer,
      lastCapture: newLastCapture,
    },
    players: {
      ...state.players,
      [player]: {
        ...playerState,
        hand: newHand,
        captured: newCaptured,
        scopaCount: newScopaCount,
        scopaCaptures: newScopaCaptures,
      },
    },
  };
}
