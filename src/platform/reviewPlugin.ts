// The app's own Review plugin (ios/App/App/ReviewPlugin.swift): asks the
// system for the App Store rating prompt. Only imported from native code
// paths (src/platform/review.ts).
import { registerPlugin } from '@capacitor/core';

export interface ReviewPlugin {
  /** `requested` is false when the app had no window to show the prompt in. */
  request(): Promise<{ requested: boolean }>;
}

export const Review = registerPlugin<ReviewPlugin>('Review');
