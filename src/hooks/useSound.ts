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

// --- Web Audio API Singleton ---

// Global AudioContext
let audioContext: AudioContext | null = null;

// Cache for decoded AudioBuffers
const bufferCache: Map<string, AudioBuffer> = new Map();

// Track loading state to prevent redundant fetches
const loadingPromises: Map<string, Promise<AudioBuffer>> = new Map();

/**
 * Get or create the global AudioContext
 */
function getAudioContext(): AudioContext {
  if (!audioContext) {
    // Standard AudioContext with fallback for older browsers
    // @ts-expect-error - webkitAudioContext is a vendor prefix for older Safari
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioCtx();
  }
  return audioContext;
}

/**
 * Decode an audio file from a URL into an AudioBuffer
 */
async function loadAndDecodeAudio(url: string): Promise<AudioBuffer> {
  // Check cache first
  const cached = bufferCache.get(url);
  if (cached) return cached;

  // Check if already loading
  const existingPromise = loadingPromises.get(url);
  if (existingPromise) return existingPromise;

  const promise = (async () => {
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const context = getAudioContext();
      const audioBuffer = await context.decodeAudioData(arrayBuffer);
      bufferCache.set(url, audioBuffer);
      return audioBuffer;
    } catch (error) {
      console.error(`Failed to load/decode audio from ${url}:`, error);
      throw error;
    } finally {
      loadingPromises.delete(url);
    }
  })();

  loadingPromises.set(url, promise);
  return promise;
}

/**
 * Preload all audio files
 */
function preloadAllAudio(): void {
  Object.values(SOUND_FILES).flat().forEach(src => {
    loadAndDecodeAudio(src).catch(() => {
      // Errors logged in loadAndDecodeAudio
    });
  });
}

/**
 * Resume AudioContext on user gesture (standard requirement)
 */
async function resumeContext(): Promise<void> {
  const context = getAudioContext();
  if (context.state === 'suspended') {
    await context.resume().catch(err => {
      console.debug('Failed to resume AudioContext:', err);
    });
  }
}

/**
 * Get a random variant of a sound type
 */
function getRandomSound(type: SoundType): string {
  const files = SOUND_FILES[type];
  return files[Math.floor(Math.random() * files.length)];
}

// --- Hook Implementation ---

export interface UseSoundOptions {
  /** Whether sounds are enabled (default: true) */
  enabled?: boolean;
}

export interface UseSoundReturn {
  /** Play a sound effect */
  play: (type: SoundType) => void;
  /** Play deal sound for multiple cards (staggered) */
  playDeal: (cardCount: number, staggerMs?: number) => void;
  /** Stop all sounds (immediate) */
  stopAll: () => void;
  /** Resume AudioContext (call after user interaction if sounds aren't playing) */
  resume: () => Promise<void>;
}

/**
 * Hook for playing game sound effects using Web Audio API.
 * This is more robust than HTMLAudioElement for Mac/Safari compatibility
 * and prevents sound blocking by resuming context on every interaction.
 */
export function useSound(options: UseSoundOptions = {}): UseSoundReturn {
  const { enabled = true } = options;

  // Track active buffer sources for cleanup (though normally they're one-shot)
  const activeSources = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Initialize and preload on mount
  useEffect(() => {
    preloadAllAudio();

    // Interaction handlers to resume AudioContext
    const handleInteraction = () => {
      resumeContext();
    };

    document.addEventListener('touchstart', handleInteraction, { once: false });
    document.addEventListener('mousedown', handleInteraction, { once: false });
    document.addEventListener('keydown', handleInteraction, { once: false });

    return () => {
      document.removeEventListener('touchstart', handleInteraction);
      document.removeEventListener('mousedown', handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
    };
  }, []);

  /**
   * Play a single sound using Web Audio API
   */
  const play = useCallback(async (type: SoundType) => {
    if (!enabled) return;

    try {
      const src = getRandomSound(type);
      const buffer = await loadAndDecodeAudio(src);
      const context = getAudioContext();

      // Always try to resume context to ensure it's active
      if (context.state === 'suspended') {
        await context.resume();
      }

      // Create and configure source node
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);

      // Track source
      activeSources.current.add(source);
      source.onended = () => {
        activeSources.current.delete(source);
      };

      source.start(0);
    } catch (err) {
      console.debug('Sound play failed:', err);
    }
  }, [enabled]);

  /**
   * Play staggered deal sounds for multiple cards
   */
  const playDeal = useCallback((cardCount: number, staggerMs = 100) => {
    if (!enabled || cardCount <= 0) return;

    // First card immediately
    play('deal');

    // Subsequent cards with stagger
    for (let i = 1; i < cardCount; i++) {
      setTimeout(() => play('deal'), i * staggerMs);
    }
  }, [enabled, play]);

  /**
   * Stop all currently playing sounds (rarely needed for short effects)
   */
  const stopAll = useCallback(() => {
    activeSources.current.forEach(source => {
      try {
        source.stop();
      } catch {
        // Source might already have stopped
      }
    });
    activeSources.current.clear();
  }, []);

  /**
   * Manually resume AudioContext (useful when game starts after inactivity)
   */
  const resume = useCallback(async () => {
    await resumeContext();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      activeSources.current.forEach(source => {
        try {
          source.stop();
        } catch {
          // Ignore errors
        }
      });
      activeSources.current.clear();
    };
  }, []);

  return { play, playDeal, stopAll, resume };
}
