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
  | 'setteBello' // Sette Bello celebration
  | 'victory'   // Game end victory
  | 'coin';     // Denari (coin) captured

// Sound file mapping with variants for variety
// Using MP3 format for Safari/iOS compatibility (Safari doesn't support OGG)
const SOUND_FILES: Record<SoundType, string[]> = {
  deal: ['./sounds/card-fan-1.mp3'],
  play: ['./sounds/card-place-1.mp3', './sounds/card-place-2.mp3'],
  capture: ['./sounds/card-shove-1.mp3', './sounds/card-shove-2.mp3'],
  slide: ['./sounds/card-slide-1.mp3', './sounds/card-slide-2.mp3'],
  scopa: ['./sounds/broom-sweep.mp3'],
  setteBello: ['./sounds/chips-stack-4.mp3'],
  victory: ['./sounds/chips-stack-1.mp3', './sounds/chips-stack-4.mp3'],
  coin: ['./sounds/coin-dropped-81172.mp3'],
};

// Audio pool for reuse (iOS performs better with reused elements)
const POOL_SIZE = 8;
const audioPool: HTMLAudioElement[] = [];
let poolIndex = 0;

// Preloaded audio buffers
const audioCache: Map<string, HTMLAudioElement> = new Map();

// Track if audio has been unlocked (iOS requires user gesture)
let audioUnlocked = false;

// Initialize audio pool
function initPool(): void {
  if (audioPool.length > 0) return;
  for (let i = 0; i < POOL_SIZE; i++) {
    const audio = new Audio();
    audio.preload = 'auto';
    audioPool.push(audio);
  }
}

// Preload all audio files
function preloadAudio(): void {
  Object.values(SOUND_FILES).flat().forEach(src => {
    if (!audioCache.has(src)) {
      const audio = new Audio(src);
      audio.preload = 'auto';
      // Load the audio data
      audio.load();
      audioCache.set(src, audio);
    }
  });
}

// Unlock audio on iOS (must be called from user gesture)
function unlockAudio(): void {
  if (audioUnlocked) return;

  // Play silent audio to unlock iOS audio
  const audio = audioPool[0] || new Audio();
  audio.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwmHAAAAAAD/+xBkAA/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQZB4P8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQ==';
  audio.volume = 0.01;

  const playPromise = audio.play();
  if (playPromise) {
    playPromise
      .then(() => {
        audioUnlocked = true;
        audio.pause();
        audio.currentTime = 0;
      })
      .catch(() => {
        // Still locked, will try again on next interaction
      });
  }
}

// Get a random variant of a sound type
function getRandomSound(type: SoundType): string {
  const files = SOUND_FILES[type];
  return files[Math.floor(Math.random() * files.length)];
}

// Get next audio element from pool
function getPooledAudio(): HTMLAudioElement {
  const audio = audioPool[poolIndex];
  poolIndex = (poolIndex + 1) % POOL_SIZE;
  return audio;
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
 * Optimized for iOS Safari compatibility
 */
export function useSound(options: UseSoundOptions = {}): UseSoundReturn {
  const { enabled = true } = options;

  // Track active audio elements for cleanup
  const activeAudios = useRef<Set<HTMLAudioElement>>(new Set());

  // Initialize pool and preload audio on first use
  useEffect(() => {
    initPool();
    preloadAudio();

    // Unlock audio on first user interaction (iOS requirement)
    const handleInteraction = () => {
      unlockAudio();
    };

    document.addEventListener('touchstart', handleInteraction, { once: true });
    document.addEventListener('click', handleInteraction, { once: true });

    return () => {
      document.removeEventListener('touchstart', handleInteraction);
      document.removeEventListener('click', handleInteraction);
    };
  }, []);

  // Play a single sound
  const play = useCallback((type: SoundType) => {
    if (!enabled) return;

    const src = getRandomSound(type);

    // Use pooled audio element for better iOS performance
    const audio = getPooledAudio();

    // Stop any current playback on this element
    audio.pause();
    audio.currentTime = 0;

    // Set new source and play
    audio.src = src;

    // Track for cleanup
    activeAudios.current.add(audio);

    // Clean up after playback
    const handleEnded = () => {
      activeAudios.current.delete(audio);
      audio.removeEventListener('ended', handleEnded);
    };
    audio.addEventListener('ended', handleEnded);

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
