// Sound effects hook for game audio
// Audio files from Kenney.nl Casino Audio pack (CC0 license)
// Optimized for iOS Safari compatibility

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

// Number of pre-created instances per sound file for concurrent playback
const INSTANCES_PER_SOUND = 3;

// Pre-created audio instances per sound file
// Key: file path, Value: array of audio elements for that file
const audioInstances: Map<string, HTMLAudioElement[]> = new Map();
const instanceIndex: Map<string, number> = new Map();

// Track if audio has been unlocked (iOS requires user gesture)
let audioUnlocked = false;

// Initialize all audio instances
function initAudioInstances(): void {
  if (audioInstances.size > 0) return;

  Object.values(SOUND_FILES).flat().forEach(src => {
    if (!audioInstances.has(src)) {
      const instances: HTMLAudioElement[] = [];
      for (let i = 0; i < INSTANCES_PER_SOUND; i++) {
        const audio = new Audio(src);
        audio.preload = 'auto';
        audio.load(); // Force load on iOS
        instances.push(audio);
      }
      audioInstances.set(src, instances);
      instanceIndex.set(src, 0);
    }
  });
}

// Unlock audio on iOS (must be called from user gesture)
function unlockAudio(): void {
  if (audioUnlocked) return;

  // Touch all audio elements to unlock them on iOS
  audioInstances.forEach((instances) => {
    instances.forEach(audio => {
      // Play and immediately pause to unlock
      audio.volume = 0;
      const promise = audio.play();
      if (promise) {
        promise.then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = 1;
        }).catch(() => {
          audio.volume = 1;
        });
      }
    });
  });

  audioUnlocked = true;
}

// Get a random variant of a sound type
function getRandomSound(type: SoundType): string {
  const files = SOUND_FILES[type];
  return files[Math.floor(Math.random() * files.length)];
}

// Get next audio instance for a sound file (round-robin)
function getAudioInstance(src: string): HTMLAudioElement | null {
  const instances = audioInstances.get(src);
  if (!instances || instances.length === 0) return null;

  const idx = instanceIndex.get(src) || 0;
  const audio = instances[idx];
  instanceIndex.set(src, (idx + 1) % instances.length);

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
 * Optimized for iOS Safari compatibility:
 * - Pre-creates audio elements for each sound file
 * - Unlocks all audio on first user interaction
 * - Reuses elements without changing src (iOS loads faster)
 */
export function useSound(options: UseSoundOptions = {}): UseSoundReturn {
  const { enabled = true } = options;

  // Track active audio elements for cleanup
  const activeAudios = useRef<Set<HTMLAudioElement>>(new Set());

  // Initialize and unlock audio
  useEffect(() => {
    initAudioInstances();

    // Unlock audio on first user interaction (iOS requirement)
    const handleInteraction = () => {
      unlockAudio();
    };

    // Use multiple events to catch interaction
    document.addEventListener('touchstart', handleInteraction, { passive: true });
    document.addEventListener('touchend', handleInteraction, { passive: true });
    document.addEventListener('click', handleInteraction);
    document.addEventListener('keydown', handleInteraction);

    return () => {
      document.removeEventListener('touchstart', handleInteraction);
      document.removeEventListener('touchend', handleInteraction);
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
    };
  }, []);

  // Play a single sound
  const play = useCallback((type: SoundType) => {
    if (!enabled) return;

    const src = getRandomSound(type);
    const audio = getAudioInstance(src);

    if (!audio) return;

    // Reset and play (don't change src - it's already set)
    audio.currentTime = 0;

    // Track for cleanup
    activeAudios.current.add(audio);

    // Clean up tracking after playback
    const handleEnded = () => {
      activeAudios.current.delete(audio);
      audio.removeEventListener('ended', handleEnded);
    };
    audio.addEventListener('ended', handleEnded);

    audio.play().catch(err => {
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
