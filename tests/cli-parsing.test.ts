import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SpyInstance } from 'vitest';

/** Mock the codex SDK before importing the module to avoid missing dependency errors */
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

import type * as Deleg from '../src/codex-delegate';
let helpers: typeof Deleg;

/** Import the target module after applying mocks so imports don't execute network code. */
beforeEach(async (): Promise<void> => {
  helpers = await import('../src/codex-delegate');
});

describe('CLI Parsing and Helpers', () => {
  /** Spy on process.exit to avoid terminating the test runner */
  let exitSpy: SpyInstance<(...args: unknown[]) => never, unknown[]>;
  /** Spy on console.info to capture help/list output */
  let infoSpy: SpyInstance<(...args: unknown[]) => void, unknown[]>;

  /** Setup spies before each test */
  beforeEach((): void => {
    exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(
        (..._args: unknown[]): never => undefined as never,
      ) as unknown as SpyInstance<(...args: unknown[]) => never, unknown[]>;
    infoSpy = vi
      .spyOn(console, 'info')
      .mockImplementation((..._args: unknown[]): void => undefined) as unknown as SpyInstance<
      (...args: unknown[]) => void,
      unknown[]
    >;
  });

  /** Restore mocks after each test */
  afterEach((): void => {
    vi.restoreAllMocks();
  });

  it('CLI-01: parse boolean flag with explicit true', () => {
    expect(helpers.parseBoolean('true')).toBe(true);
  });

  it('CLI-02: parse boolean flag with explicit false', () => {
    expect(helpers.parseBoolean('false')).toBe(false);
  });

  it('CLI-03: parse boolean flag with no explicit value (flag only)', () => {
    const opts = helpers.parseArgs(['--verbose']);
    expect(opts.verbose).toBe(true);
  });

  it('CLI-04: parse unknown option is ignored', () => {
    const opts = helpers.parseArgs(['--nope', 'value']);
    // unknown option should be ignored and not set as a property
    // unknown option should be ignored and not set as a property
    expect((opts as Record<string, unknown>)['nope']).toBeUndefined();
    // defaults preserved
    expect(opts.role).toBeDefined();
  });

  it('CLI-05: parse numeric integer (--max-items)', () => {
    const opts = helpers.parseArgs(['--max-items', '5']);
    expect(opts.maxItems).toBe(5);
  });

  it('CLI-06: parse numeric float (--timeout-minutes)', () => {
    const opts = helpers.parseArgs(['--timeout-minutes', '2.5']);
    expect(opts.timeoutMinutes).toBe(2.5);
  });

  it('CLI-07: invalid numeric ignored (NaN)', () => {
    const opts = helpers.parseArgs(['--max-items', 'abc']);
    expect(opts.maxItems).toBeUndefined();
  });

  it('CLI-08: immediate flag --help prints and exits', () => {
    helpers.handleImmediateFlag('--help');
    // printHelp writes to console.info; assert it produced output and exited
    expect(infoSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('CLI-09: immediate flag --list-roles prints roles and exits', () => {
    // ensure there are known roles in the repo
    const roles = helpers.listPromptRoles();
    expect(Array.isArray(roles)).toBe(true);
    helpers.handleImmediateFlag('--list-roles');
    expect(infoSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('CLI-10: combined options parse correctly', () => {
    const opts = helpers.parseArgs(['--role', 'review', '--task', 'Fix bug', '--structured']);
    expect(opts.role).toBe('review');
    expect(opts.task).toBe('Fix bug');
    expect(opts.structured).toBe(true);
  });

  it('CLI-11: isOption recognizes only prefixed, known aliases', () => {
    expect(helpers.isOption('--role')).toBe(true);
    expect(helpers.isOption('--unknown')).toBe(false);
  });

  it('CLI-12: applyBooleanOption consumes tokens correctly', () => {
    const opts = helpers.parseArgs([]);
    const consumed = helpers.applyBooleanOption(opts, 'verbose' as const, '--role');
    expect(consumed).toBe(1);
    expect(opts.verbose).toBe(true);
  });

  it('CLI-13: parseBoolean returns undefined for non-boolean inputs', () => {
    expect(helpers.parseBoolean('yes')).toBeUndefined();
  });

  it('CLI-14: isOption returns false for undefined or short/invalid tokens', () => {
    expect(helpers.isOption(undefined)).toBe(false);
    expect(helpers.isOption('-h')).toBe(false);
    expect(helpers.isOption('role')).toBe(false);
  });

  it('CLI-15: isBooleanOption returns false for non-boolean keys', () => {
    expect(helpers.isBooleanOption('task')).toBe(false);
  });

  it('CLI-16: applyBooleanOption consumes 2 tokens for explicit booleans', () => {
    const opts = helpers.parseArgs([]);
    const consumed = helpers.applyBooleanOption(opts, 'verbose' as const, 'false');
    expect(consumed).toBe(2);
    expect(opts.verbose).toBe(false);
  });

  it('CLI-17: repeated options - last occurrence wins', () => {
    const opts = helpers.parseArgs(['--max-items', '1', '--max-items', '3']);
    expect(opts.maxItems).toBe(3);
  });
});
