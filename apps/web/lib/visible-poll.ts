export function pollWhileVisible(
  read: (signal: AbortSignal) => Promise<boolean | number>,
) {
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  let pending = false;
  let stopped = false;
  let attempt = 0;
  let notBefore = 0;
  const run = async () => {
    clearTimeout(timer);
    if (abort.signal.aborted || pending || stopped || document.hidden) return;
    if (Date.now() < notBefore) {
      timer = setTimeout(run, notBefore - Date.now());
      return;
    }
    pending = true;
    let retryAfter = 0;
    try {
      const next = await read(abort.signal);
      stopped = next === false;
      if (typeof next === "number") retryAfter = next;
      notBefore = Date.now() + retryAfter;
    } finally {
      pending = false;
      if (!abort.signal.aborted && !stopped && !document.hidden) {
        const delay = Math.min(30_000, 5_000 * 2 ** attempt++);
        timer = setTimeout(
          run,
          Math.max(
            retryAfter,
            Math.min(30_000, delay * (0.85 + Math.random() * 0.3)),
          ),
        );
      }
    }
  };
  const visibility = () => {
    if (document.hidden) clearTimeout(timer);
    else void run();
  };
  document.addEventListener("visibilitychange", visibility);
  void run();
  return () => {
    abort.abort();
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", visibility);
  };
}
