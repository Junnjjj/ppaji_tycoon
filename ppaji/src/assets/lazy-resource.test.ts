import { describe, it, expect, vi } from 'vitest';
import { LazyResource } from './lazy-resource.js';
const flush = async () => { for(let i=0;i<10;i++)await Promise.resolve(); };
describe('demand asset loading', () => {
  it('does not load before use, deduplicates concurrent frames and waits for completion', async () => {
    let finish!:()=>void;
    const loader=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;}));
    const assets=new LazyResource(loader);
    expect(loader).not.toHaveBeenCalled();
    expect(assets.ensure('sauna')).toBe(false);
    expect(assets.ensure('sauna')).toBe(false);
    await flush();expect(loader).toHaveBeenCalledTimes(1);
    expect(assets.ensure('sauna')).toBe(false);
    finish();await flush();
    expect(assets.ensure('sauna')).toBe(true);
    expect(loader).toHaveBeenCalledTimes(1);
  });
  it('retries failed loads without a request every animation frame', async () => {
    const now=vi.spyOn(Date,'now').mockReturnValue(1000);
    const warning=vi.spyOn(console,'warn').mockImplementation(()=>{});
    try {
      const loader=vi.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValue(undefined);
      const assets=new LazyResource(loader);
      assets.ensure('boat');await flush();
      expect(assets.ensure('boat')).toBe(false);await flush();
      expect(loader).toHaveBeenCalledTimes(1);
      now.mockReturnValue(11001);assets.ensure('boat');await flush();
      expect(assets.ensure('boat')).toBe(true);
      expect(loader).toHaveBeenCalledTimes(2);
    } finally {now.mockRestore();warning.mockRestore();}
  });
});
