import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Mock the codex SDK before importing the module to avoid network code */
vi.mock('codex-sdk', (): { Codex: new () => unknown } => ({
  Codex: class {
    /**
     * Return a mock thread with a `runStreamed` method that emits no events.
     * @returns An object with a `runStreamed` method returning a promise that resolves to a no-op events generator
     */
    startThread(): {
      runStreamed: () => Promise<{ events: AsyncGenerator<never, void, unknown> }>;
    } {
      return {
        /**
         * Return a promise resolving to an events async generator (yields no events)
         * @returns A promise resolving to an object with an `events` async generator
         */
        runStreamed: async function (): Promise<{ events: AsyncGenerator<never, void, unknown> }> {
          return { events: (async function* (): AsyncGenerator<never, void, unknown> {})() };
        },
      };
    }
  },
}));

let helpers: typeof import('../src/codex-delegate');
beforeEach(async () => {
  helpers = await import('../src/codex-delegate');
});

describe('Option Validation', () => {
  const baseOptions = { role: 'tester', task: 'exercise', instructions: 'none' };

  it('VAL-01: valid reasoning allowed', () => {
    expect(() =>
      helpers.validateOptions({ ...baseOptions, reasoning: 'low' as const }),
    ).not.toThrow();
  });

  it('VAL-02: invalid reasoning throws descriptive Error', () => {
    expect(() =>
      helpers.validateOptions({ ...baseOptions, reasoning: 'ultra' as unknown as string }),
    ).toThrow();
    try {
      helpers.validateOptions({ ...baseOptions, reasoning: 'ultra' as unknown as string });
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain('--reasoning');
      // should list at least one valid reasoning level
      expect((err as Error).message).toMatch(/minimal|low|medium|high|xhigh/);
    }
  });

  it('VAL-03: invalid sandbox throws descriptive Error', () => {
    // cast to `any` to simulate invalid runtime value that TypeScript cannot represent in the narrow union
    expect(() =>
      helpers.validateOptions({ ...baseOptions, sandbox: 'nope' } as unknown as Parameters<
        typeof helpers.validateOptions
      >[0]),
    ).toThrow();
    try {
      helpers.validateOptions({ ...baseOptions, sandbox: 'nope' } as unknown as Parameters<
        typeof helpers.validateOptions
      >[0]);
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain('--sandbox');
      expect((err as Error).message).toMatch(/read-only|workspace-write|danger-full-access/);
    }
  });

  it('VAL-04: invalid approval throws descriptive Error', () => {
    expect(() =>
      helpers.validateOptions({ ...baseOptions, approval: 'sometimes' } as unknown as Parameters<
        typeof helpers.validateOptions
      >[0]),
    ).toThrow();
    try {
      helpers.validateOptions({ ...baseOptions, approval: 'sometimes' } as unknown as Parameters<
        typeof helpers.validateOptions
      >[0]);
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain('--approval');
      expect((err as Error).message).toMatch(/never|on-request|on-failure|untrusted/);
    }
  });

  it('VAL-05: invalid web-search throws descriptive Error', () => {
    expect(() =>
      helpers.validateOptions({ ...baseOptions, webSearch: 'liveish' } as unknown as Parameters<
        typeof helpers.validateOptions
      >[0]),
    ).toThrow();
    try {
      helpers.validateOptions({ ...baseOptions, webSearch: 'liveish' } as unknown as Parameters<
        typeof helpers.validateOptions
      >[0]);
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain('--web-search');
      expect((err as Error).message).toMatch(/disabled|cached|live/);
    }
  });
});
