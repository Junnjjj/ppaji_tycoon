/** Deduplicated demand loading; failed requests retry after a quiet interval. */
export class LazyResource {
  private ready = new Set<string>();
  private pending = new Map<string, Promise<void>>();
  private retryAt = new Map<string, number>();
  constructor(private readonly loader: (id: string) => Promise<void>) {}
  ensure(id: string): boolean {
    if (this.ready.has(id)) return true;
    if (!this.pending.has(id) && Date.now() >= (this.retryAt.get(id) ?? 0)) {
      const request = Promise.resolve().then(() => this.loader(id)).then(() => {
        this.ready.add(id); this.retryAt.delete(id);
      }).catch((error: unknown) => {
        this.retryAt.set(id, Date.now() + 10000);
        console.warn(`Asset load deferred: ${id}`, error);
      }).finally(() => { this.pending.delete(id); });
      this.pending.set(id, request);
    }
    return false;
  }
}
