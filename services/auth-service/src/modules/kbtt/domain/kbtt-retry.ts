export const KBTT_RETRY_DELAY_MS = 10_000;
export const KBTT_READ_RETRIES = 2;

export function waitForKbttRetry(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const finish = () => { signal.removeEventListener("abort", abort); resolve(); };
    const timer = setTimeout(finish, KBTT_RETRY_DELAY_MS);
    timer.unref?.();
    const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(signal.reason); };
    signal.addEventListener("abort", abort, { once: true });
  });
}

export async function withKbttDeadline<T>(operation: (signal: AbortSignal) => Promise<T>, parent?: AbortSignal, timeoutMs = 10_000): Promise<T> {
  const controller = new AbortController();
  const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
  signal.throwIfAborted();
  const timer = setTimeout(() => controller.abort(new Error("BCA request deadline exceeded")), timeoutMs);
  timer.unref?.();
  let onAbort!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try { return await Promise.race([operation(signal), aborted]); }
  finally { clearTimeout(timer); signal.removeEventListener("abort", onAbort); }
}
