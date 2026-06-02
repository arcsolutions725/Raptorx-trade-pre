/** Coalesce rapid stream updates to one React commit per animation frame. */

export function createStreamRafBatcher<T>(flush: (value: T) => void) {
  let rafId: number | null = null;
  let pending: T | null = null;

  const run = () => {
    rafId = null;
    if (pending === null) return;
    const v = pending;
    pending = null;
    flush(v);
  };

  return {
    schedule(value: T) {
      pending = value;
      if (rafId != null) return;
      rafId = requestAnimationFrame(run);
    },
    flushNow(value: T) {
      if (rafId != null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      pending = null;
      flush(value);
    },
    cancel() {
      if (rafId != null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      pending = null;
    },
  };
}
