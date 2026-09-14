// The build-info report is validated strictly: anything the shell did not
// state as a proper value is "unknown" (null), which the gate treats as no.
import { describe, it, expect, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({ get: async () => { throw new Error('UNIMPLEMENTED'); } }) }));

import { readNativeBuildInfo } from './buildInfo';

describe('readNativeBuildInfo', () => {
  it('returns the report when every field has the right type', async () => {
    const info = await readNativeBuildInfo({ get: async () => ({ configuration: 'Release', debug: false, simulator: false }) });
    expect(info).toEqual({ configuration: 'Release', debug: false, simulator: false });
  });
  it('returns null for a missing plugin, a rejection, or a malformed report', async () => {
    expect(await readNativeBuildInfo()).toBeNull(); // the mocked default plugin rejects (UNIMPLEMENTED)
    expect(await readNativeBuildInfo({ get: async () => { throw new Error('boom'); } })).toBeNull();
    expect(await readNativeBuildInfo({ get: async () => ({}) })).toBeNull();
    expect(await readNativeBuildInfo({ get: async () => ({ configuration: 'Release', debug: 'no', simulator: false }) })).toBeNull();
    expect(await readNativeBuildInfo({ get: async () => ({ configuration: 'Release', debug: false }) })).toBeNull();
    expect(await readNativeBuildInfo({ get: async () => null as never })).toBeNull();
  });
});
