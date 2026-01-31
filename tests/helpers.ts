/**
 * Minimal local `StreamedEvent` type used by tests. Using a local
 * definition avoids depending on the module's exported types in the test
 * environment and keeps the tests self-contained.
 */
export interface StreamedEvent {
  type: string;
  item?: Record<string, unknown>;
  usage?: { input_tokens: number; output_tokens: number };
  error?: { message: string };
  message?: string;
}

// Minimal StreamedItem type for tests
export type StreamedItem = Record<string, unknown>;

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
  // Implement as an object-based async iterator where `next()` returns a
  // Promise that never resolves. This avoids using an async generator with
  // no `yield` (which TypeScript flags as an error).
  return {
    /**
     * Returns an async iterator whose `next()` never resolves.
     * @returns An `AsyncIterator<StreamedEvent>` whose `next()` never resolves
     */
    [Symbol.asyncIterator](): AsyncIterator<StreamedEvent> {
      return {
        /**
         * Never resolve the next promise.
         * @returns A promise that never resolves
         */
        next(): Promise<IteratorResult<StreamedEvent>> {
          return new Promise<never>(() => {});
        },
        /**
         * Called when the consumer requests return.
         * @returns A `Promise` resolving to an iterator result with `done: true`
         */
        async return(): Promise<IteratorResult<StreamedEvent>> {
          return { value: undefined, done: true } as const;
        },
      };
    },
  };
}

/**
 * An async iterable that yields no events and completes immediately.
 *
 * @returns An empty `AsyncIterable<StreamedEvent>`
 */
export function emptyStream(): AsyncIterable<StreamedEvent> {
  return {
    /**
     * Returns an async iterator that completes immediately.
     * @returns An `AsyncIterator<StreamedEvent>` that completes immediately
     */
    [Symbol.asyncIterator](): AsyncIterator<StreamedEvent> {
      return {
        /**
         * Resolve immediately with done
         * @returns A promise resolving to `{ done: true }`
         */
        next(): Promise<IteratorResult<StreamedEvent>> {
          return Promise.resolve({ value: undefined, done: true } as IteratorResult<StreamedEvent>);
        },
        /**
         * Called when the consumer requests return.
         * @returns A `Promise` resolving to an iterator result with `done: true`
         */
        async return(): Promise<IteratorResult<StreamedEvent>> {
          return { value: undefined, done: true } as const;
        },
      };
    },
  };
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
     * Returns an async iterator whose next throws synchronously.
     * @returns An `AsyncIterator<StreamedEvent>` which throws synchronously from `next()`
     */
    [Symbol.asyncIterator](): AsyncIterator<StreamedEvent> {
      return {
        /**
         * Throw synchronously from next()
         * @returns Never (throws)
         */
        next(): Promise<IteratorResult<StreamedEvent>> {
          throw new Error('sync-next-throw');
        },
        /**
         * Called when the consumer requests return.
         * @returns A `Promise` resolving to an iterator result with `done: true`
         */
        async return(): Promise<IteratorResult<StreamedEvent>> {
          if (flagObj) flagObj.returned = true;
          return { value: undefined, done: true } as const;
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
     * Returns an async iterator where next() rejects asynchronously.
     * @returns An `AsyncIterator<StreamedEvent>` whose `next()` rejects
     */
    [Symbol.asyncIterator](): AsyncIterator<StreamedEvent> {
      return {
        /**
         * Reject asynchronously from next()
         * @returns A promise rejecting with an Error
         */
        next(): Promise<IteratorResult<StreamedEvent>> {
          return Promise.reject(new Error('async-next-throw'));
        },
        /**
         * Called when the consumer requests return.
         * @returns A `Promise` resolving to an iterator result with `done: true`
         */
        async return(): Promise<IteratorResult<StreamedEvent>> {
          if (flagObj) flagObj.returned = true;
          return { value: undefined, done: true } as const;
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
     * Returns an async iterator whose next never resolves but return resolves.
     * @returns An `AsyncIterator<StreamedEvent>` where `next()` never resolves
     */
    [Symbol.asyncIterator](): AsyncIterator<StreamedEvent> {
      return {
        /**
         * never resolve next
         * @returns A promise that never resolves
         */
        next(): Promise<IteratorResult<StreamedEvent>> {
          return new Promise<never>(() => {});
        },
        /**
         * Called when the consumer requests return.
         * @returns A `Promise` resolving to an iterator result with `done: true`
         */
        async return(): Promise<IteratorResult<StreamedEvent>> {
          return { value: undefined, done: true } as const;
        },
      };
    },
  } as AsyncIterable<StreamedEvent>;
}
