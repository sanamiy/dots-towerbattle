/** Bound peak memory for work that uses a shared WASM heap, preserving arrival order. */
export function serialWork() {
  let tail: Promise<void> = Promise.resolve();
  return async function run<T>(work: () => Promise<T>): Promise<T> {
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await work(); }
    finally { release(); }
  };
}
