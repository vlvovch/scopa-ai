// Apple Intelligence (the Foundation Models framework, iOS 26+) through
// the app's own plugin (ios/App/App/AppleIntelligencePlugin.swift,
// registered in MainViewController). Probed once at start-up; the result
// goes into src/ai/onDeviceModel.ts, which is all the bots ever import.
//
// Only imported from native code paths (see src/platform/native.ts).
import { registerPlugin } from '@capacitor/core';
import type { OnDeviceModel, OnDeviceMoveRequest, OnDeviceMoveResponse } from '../ai/onDeviceModel';

export interface AppleIntelligencePlugin {
  /** Whether the system model can be used right now, and if not, why. */
  availability(): Promise<{ available?: unknown; reason?: unknown }>;
  /** One guided-generation request; rejects when the model fails, times out or is cancelled. */
  selectMove(options: OnDeviceMoveRequest): Promise<OnDeviceMoveResponse>;
  /** Cancel a running request by id. */
  cancel(options: { requestId: string }): Promise<void>;
  /** Load the model and prepare a session with these instructions for the next request. */
  prewarm(options: { instructions: string }): Promise<void>;
  /** Drop the prepared session. */
  releaseSession(): Promise<void>;
}

export const AppleIntelligence = registerPlugin<AppleIntelligencePlugin>('AppleIntelligence');

export interface OnDeviceProbe {
  model: OnDeviceModel | null;
  reason: string;
}

/** Ask the shell whether the model is usable; never throws. */
export async function probeAppleIntelligence(plugin: AppleIntelligencePlugin = AppleIntelligence): Promise<OnDeviceProbe> {
  try {
    const result = await plugin.availability();
    if (result?.available === true) {
      return {
        model: {
          selectMove: (request) => plugin.selectMove(request),
          cancel: (requestId) => plugin.cancel({ requestId }).catch(() => undefined),
          prewarm: (instructions) => plugin.prewarm({ instructions }).catch(() => undefined),
          release: () => plugin.releaseSession().catch(() => undefined),
        },
        reason: 'available',
      };
    }
    return { model: null, reason: typeof result?.reason === 'string' && result.reason ? result.reason : 'unavailable' };
  } catch (err) {
    return { model: null, reason: `plugin error: ${err instanceof Error ? err.message : String(err)}` };
  }
}
