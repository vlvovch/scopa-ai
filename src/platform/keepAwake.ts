// Keep the screen on through the app's own KeepAwake plugin
// (ios/App/App/KeepAwakePlugin.swift): the system idle timer is disabled
// while a caller holds the lock. Only imported from native code paths.
import { registerPlugin } from '@capacitor/core';
import type { KeepAwakeBackend } from '../hooks/useKeepAwake';

export interface KeepAwakePlugin {
  setEnabled(options: { enabled: boolean }): Promise<void>;
}

export const KeepAwake = registerPlugin<KeepAwakePlugin>('KeepAwake');

export const nativeKeepAwake: KeepAwakeBackend = {
  acquire: () => KeepAwake.setEnabled({ enabled: true }).catch(() => undefined),
  release: () => KeepAwake.setEnabled({ enabled: false }).catch(() => undefined),
};
