import { describe, it, expect, afterEach } from 'vitest';
import { setOnDeviceModel, getOnDeviceModel, isOnDeviceModelAvailable, getOnDeviceModelUnavailableReason } from './onDeviceModel';

afterEach(() => setOnDeviceModel(null, 'not initialised'));

describe('on-device model registry', () => {
  it('is empty until the native bootstrap fills it, and says why', () => {
    expect(isOnDeviceModelAvailable()).toBe(false);
    expect(getOnDeviceModel()).toBeNull();
    expect(getOnDeviceModelUnavailableReason()).toBe('not initialised');
    setOnDeviceModel(null, 'Apple Intelligence not enabled');
    expect(getOnDeviceModelUnavailableReason()).toBe('Apple Intelligence not enabled');
  });
  it('exposes the model once set', () => {
    const model = { selectMove: async () => ({ moveIndex: 0, reasoning: '' }), cancel: async () => {} };
    setOnDeviceModel(model);
    expect(isOnDeviceModelAvailable()).toBe(true);
    expect(getOnDeviceModel()).toBe(model);
    expect(getOnDeviceModelUnavailableReason()).toBe('available');
  });
});
