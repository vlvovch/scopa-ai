// How the native binary was built, from the app's own BuildInfo plugin
// (ios/App/App/BuildInfoPlugin.swift, registered in MainViewController).
// Feeds the analytics gate: anything but a Release build on a real device
// keeps analytics off, and a missing or malformed report counts as
// "unknown", which also keeps it off.
//
// Only imported from native code paths (see src/platform/native.ts).
import { registerPlugin } from '@capacitor/core';
import type { NativeBuildInfo } from '../analytics/gate';

export interface BuildInfoPlugin {
  get(): Promise<{ configuration?: unknown; debug?: unknown; simulator?: unknown }>;
}

export const BuildInfo = registerPlugin<BuildInfoPlugin>('BuildInfo');

/** The shell's report, or null when it is missing or does not make sense. */
export async function readNativeBuildInfo(plugin: BuildInfoPlugin = BuildInfo): Promise<NativeBuildInfo | null> {
  try {
    const raw = await plugin.get();
    if (
      !raw ||
      typeof raw.configuration !== 'string' ||
      typeof raw.debug !== 'boolean' ||
      typeof raw.simulator !== 'boolean'
    ) {
      return null;
    }
    return { configuration: raw.configuration, debug: raw.debug, simulator: raw.simulator };
  } catch {
    return null;
  }
}
