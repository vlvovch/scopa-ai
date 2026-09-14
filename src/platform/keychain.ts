// Keychain-backed secret store, implemented by the app's own Swift plugin
// (ios/App/App/SecureStoragePlugin.swift, registered in
// MainViewController.swift). User-supplied LLM API keys live here on iOS
// instead of in Preferences (UserDefaults) or web storage.
//
// Only imported from native code paths (see src/platform/native.ts).
import { registerPlugin } from '@capacitor/core';

export interface SecureStoragePlugin {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
}

export const SecureStorage = registerPlugin<SecureStoragePlugin>('SecureStorage');
