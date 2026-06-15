/**
 * Serializes commands to the PM2 daemon. Concurrent lifecycle operations on the
 * god daemon are a known source of races; funnelling everything through a single
 * queue keeps daemon interactions deterministic.
 */
export class CommandQueue {
  private chain: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>, timeoutMs = 15_000): Promise<T> {
    const result = this.chain.then(() => withTimeout(task(), timeoutMs));
    // Keep the chain alive even if a task rejects.
    this.chain = result.catch(() => undefined);
    return result;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`PM2 command timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
