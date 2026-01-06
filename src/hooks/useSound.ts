// Sound effects hook for game audio
// Audio files from Kenney.nl Casino Audio pack (CC0 license)

import { useCallback, useRef, useEffect } from 'react';

// Sound types available in the game
export type SoundType =
  | 'deal'      // Card dealing (fan sound)
  | 'play'      // Playing a card to table
  | 'capture'   // Capturing cards
  | 'slide'     // Card sliding
  | 'scopa'     // Scopa celebration
  | 'setteBello'; // Sette Bello celebration

// Sound file mapping with variants for variety
const SOUND_FILES: Record<SoundType, string[]> = {
  deal: ['./sounds/card-fan-1.ogg'],
  play: ['./sounds/card-place-1.ogg', './sounds/card-place-2.ogg'],
  capture: ['./sounds/card-shove-1.ogg', './sounds/card-shove-2.ogg'],
  slide: ['./sounds/card-slide-1.ogg', './sounds/card-slide-2.ogg'],
  scopa: ['./sounds/chips-stack-1.ogg', './sounds/chips-stack-4.ogg'],
  setteBello: ['./sounds/chips-stack-1.ogg', './sounds/chips-stack-4.ogg'],
};

// Preloaded audio elements cache
const audioCache: Map<string, HTMLAudioElement> = new Map();

// Preload all audio files
function preloadAudio(): void {
  Object.values(SOUND_FILES).flat().forEach(src => {
    if (!audioCache.has(src)) {
      const audio = new Audio(src);
      audio.preload = 'auto';
      audioCache.set(src, audio);
    }
  });
}

// Get a random variant of a sound type
function getRandomSound(type: SoundType): string {
  const files = SOUND_FILES[type];
  return files[Math.floor(Math.random() * files.length)];
}

export interface UseSoundOptions {
  /** Whether sounds are enabled (default: true) */
  enabled?: boolean;
}

export interface UseSoundReturn {
  /** Play a sound effect */
  play: (type: SoundType) => void;
  /** Play deal sound for multiple cards (staggered) */
  playDeal: (cardCount: number, staggerMs?: number) => void;
  /** Stop all sounds */
  stopAll: () => void;
}

/**
 * Hook for playing game sound effects
 */
export function useSound(options: UseSoundOptions = {}): UseSoundReturn {
  const { enabled = true } = options;

  // Track active audio elements for cleanup
  const activeAudios = useRef<Set<HTMLAudioElement>>(new Set());

  // Preload audio on first use
  useEffect(() => {
    preloadAudio();
  }, []);

  // Play a single sound
  const play = useCallback((type: SoundType) => {
    if (!enabled) return;

    const src = getRandomSound(type);

    // Create new audio element for concurrent playback
    const audio = new Audio(src);

    // Track for cleanup
    activeAudios.current.add(audio);

    // Clean up after playback
    audio.addEventListener('ended', () => {
      activeAudios.current.delete(audio);
    });

    audio.play().catch(err => {
      // Ignore autoplay errors (browser policy)
      console.debug('Sound play failed:', err.message);
      activeAudios.current.delete(audio);
    });
  }, [enabled]);

  // Play staggered deal sounds for multiple cards
  const playDeal = useCallback((cardCount: number, staggerMs = 100) => {
    if (!enabled || cardCount <= 0) return;

    // Play first sound immediately
    play('deal');

    // Play subsequent sounds with stagger
    for (let i = 1; i < cardCount; i++) {
      setTimeout(() => play('deal'), i * staggerMs);
    }
  }, [enabled, play]);

  // Stop all active sounds
  const stopAll = useCallback(() => {
    activeAudios.current.forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
    });
    activeAudios.current.clear();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      activeAudios.current.forEach(audio => {
        audio.pause();
      });
      activeAudios.current.clear();
    };
  }, []);

  return { play, playDeal, stopAll };
}
