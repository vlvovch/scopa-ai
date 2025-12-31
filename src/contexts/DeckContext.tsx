// Deck Context - Provides the current card deck type to all components

import { createContext, useContext } from 'react';
import type { DeckType } from '../hooks/useSettings';

const DeckContext = createContext<DeckType>('napoletane');

export function DeckProvider({
  deck,
  children
}: {
  deck: DeckType;
  children: React.ReactNode;
}) {
  return (
    <DeckContext.Provider value={deck}>
      {children}
    </DeckContext.Provider>
  );
}

export function useDeck(): DeckType {
  return useContext(DeckContext);
}
