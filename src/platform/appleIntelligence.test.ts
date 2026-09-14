// The probe never throws and only reports a model when the shell said the
// system model is usable; the model it returns delegates to the plugin.
import { describe, it, expect, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({ availability: async () => { throw new Error('UNIMPLEMENTED'); }, selectMove: async () => { throw new Error('UNIMPLEMENTED'); }, cancel: async () => {}, prewarm: async () => {}, releaseSession: async () => {} }) }));

import { probeAppleIntelligence, type AppleIntelligencePlugin } from './appleIntelligence';

/** A plugin fake with every method present, overridable per test. */
function plugin(overrides: Partial<AppleIntelligencePlugin>): AppleIntelligencePlugin {
  return {
    availability: async () => ({ available: true }),
    selectMove: vi.fn(async () => ({ moveIndex: 0, reasoning: '' })),
    cancel: vi.fn(async () => {}),
    prewarm: vi.fn(async () => {}),
    releaseSession: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('probeAppleIntelligence', () => {
  it('returns a model that delegates to the plugin when available', async () => {
    const selectMove = vi.fn(async () => ({ moveIndex: 2, reasoning: 'why' }));
    const prewarm = vi.fn(async () => {});
    const releaseSession = vi.fn(async () => {});
    const probe = await probeAppleIntelligence(plugin({ selectMove, prewarm, releaseSession }));
    expect(probe.reason).toBe('available');
    const request = { requestId: 'cpu-1', instructions: 'rules', prompt: 'state', moveCount: 3, timeoutMs: 20000 };
    await expect(probe.model!.selectMove(request)).resolves.toEqual({ moveIndex: 2, reasoning: 'why' });
    expect(selectMove).toHaveBeenCalledWith(request);
    await probe.model!.prewarm!('rules');
    expect(prewarm).toHaveBeenCalledWith({ instructions: 'rules' });
    await probe.model!.release!();
    expect(releaseSession).toHaveBeenCalledTimes(1);
  });
  it('prewarm and release never reject, even when the shell does', async () => {
    const probe = await probeAppleIntelligence(plugin({
      prewarm: async () => { throw new Error('busy'); },
      releaseSession: async () => { throw new Error('busy'); },
    }));
    await expect(probe.model!.prewarm!('rules')).resolves.toBeUndefined();
    await expect(probe.model!.release!()).resolves.toBeUndefined();
  });
  it('reports the shell\'s reason when unavailable, and treats odd answers as unavailable', async () => {
    expect(await probeAppleIntelligence(plugin({ availability: async () => ({ available: false, reason: 'device not eligible' }) })))
      .toEqual({ model: null, reason: 'device not eligible' });
    expect((await probeAppleIntelligence(plugin({ availability: async () => ({ available: 'yes' }) }))).model).toBeNull();
    expect((await probeAppleIntelligence(plugin({ availability: async () => ({}) })))).toEqual({ model: null, reason: 'unavailable' });
  });
  it('never throws: a missing plugin is just "unavailable"', async () => {
    const probe = await probeAppleIntelligence(); // the mocked default plugin rejects (UNIMPLEMENTED)
    expect(probe.model).toBeNull();
    expect(probe.reason).toContain('UNIMPLEMENTED');
  });
});
