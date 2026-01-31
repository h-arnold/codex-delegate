import type { StreamedEvent } from '@openai/codex-sdk';

/**
 * Create an async iterable that yields the provided `events`.
 *
 * @param events - Events to yield from the async iterable
 * @param delayMs - Optional millisecond delay between yields
 * @returns An `AsyncIterable<StreamedEvent>` that yields `events`
 */
export function makeEventStream(
  events: StreamedEvent[],
  delayMs = 0,
): AsyncIterable<StreamedEvent> {
  return (async function* (): AsyncIterable<StreamedEvent> {
    for (const e of events) {
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      yield e;
    }
  })();
}

/**
 * An async iterable whose `next()` never resolves (useful for timeout tests).
 *
 * @returns An `AsyncIterable<StreamedEvent>` whose `next` never resolves
 */
export function neverYieldStream(): AsyncIterable<StreamedEvent> {
  return (async function* (): AsyncIterable<StreamedEvent> {
    // never yield; next() will never resolve
    await new Promise<never>(() => {});

    return;
  })();
}

/**
 * An async iterable that yields no events and completes immediately.
 *
 * @returns An empty `AsyncIterable<StreamedEvent>`
 */
export function emptyStream(): AsyncIterable<StreamedEvent> {
  return (async function* (): AsyncIterable<StreamedEvent> {
    // yield nothing
  })();
}

/**
 * Create an async iterable which sets a flag on `return` (in `finally`).
 *
 * @param events - Events to yield
 * @param flagObj - Object to mutate when the generator's `finally` executes
 * @param flagObj.called
 * @returns An `AsyncIterable<StreamedEvent>` which sets `flagObj.called = true` on completion
 */
export function withReturnFlag(
  events: StreamedEvent[],
  flagObj: { called: boolean },
): AsyncIterable<StreamedEvent> {
  return (async function* (): AsyncIterable<StreamedEvent> {
    try {
      for (const e of events) {
        yield e;
      }
    } finally {
      flagObj.called = true;
    }
  })();
}

/**
 * An async iterable where `next()` throws synchronously. Useful to test that errors propagate.
 *
 * @param flagObj - Optional object to record whether `return` was called
 * @param flagObj.returned
 * @returns An `AsyncIterable<StreamedEvent>` whose `next` throws synchronously
 */
export function throwingNextStream(flagObj?: { returned?: boolean }): AsyncIterable<StreamedEvent> {
  return {
    /**
     * @returns void
     */
    [Symbol.asyncIterator](): AsyncIterator<StreamedEvent> {
      return {
        /**
         * @returns void
         */
        next(): Promise<IteratorResult<StreamedEvent>> {
          throw new Error('sync-next-throw');
        },
        /**
         * @returns void
         */
        async return(): Promise<IteratorResult<StreamedEvent>> {
          if (flagObj) flagObj.returned = true;
          return { done: true } as const;
        },
      };
    },
  } as AsyncIterable<StreamedEvent>;
}

/**
 * An async iterable where `next()` returns a rejected promise. Useful to test async throws.
 *
 * @param flagObj - Optional object to record whether `return` was called
 * @param flagObj.returned
 * @returns An `AsyncIterable<StreamedEvent>` whose `next` rejects asynchronously
 */
export function rejectingNextStream(flagObj?: {
  returned?: boolean;
}): AsyncIterable<StreamedEvent> {
  return {
    /**
     * @returns void
     */
    [Symbol.asyncIterator](): AsyncIterator<StreamedEvent> {
      return {
        /**
         * @returns void
         */
        next(): Promise<IteratorResult<StreamedEvent>> {
          return Promise.reject(new Error('async-next-throw'));
        },
        /**
         * @returns void
         */
        async return(): Promise<IteratorResult<StreamedEvent>> {
          if (flagObj) flagObj.returned = true;
          return { done: true } as const;
        },
      };
    },
  } as AsyncIterable<StreamedEvent>;
}

/**
 * An async iterable whose `next()` never resolves but whose `return()` resolves immediately.
 * This lets the consumer's cleanup (`iterator.return`) complete even when `next` hangs.
 *
 * @returns An `AsyncIterable<StreamedEvent>` that never resolves `next()` but has a fast `return()`
 */
export function nonResolvingNextWithReturn(): AsyncIterable<StreamedEvent> {
  return {
    /**
     * @returns void
     */
    [Symbol.asyncIterator](): AsyncIterator<StreamedEvent> {
      return {
        /**
         * @returns void
         */
        next(): Promise<IteratorResult<StreamedEvent>> {
          // never resolve
          return new Promise<never>(() => {});
        },
        /**
         * @returns void
         */
        async return(): Promise<IteratorResult<StreamedEvent>> {
          // resolve immediately so callers waiting in finally won't hang
          return { done: true } as const;
        },
      };
    },
  } as AsyncIterable<StreamedEvent>;
}
