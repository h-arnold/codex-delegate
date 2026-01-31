import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { makeEventStream, emptyStream } from './helpers';

// Each test will reset module registry and mock the Codex SDK where needed.

describe('Runner (run / main) behavior', () => {
  const originalArgv = process.argv;
  const originalCwd = process.cwd();

  beforeEach(() => {
    vi.restoreAllMocks();
    process.exitCode = 0;
  });

  afterEach(() => {
    process.argv = originalArgv;
    try {
      process.chdir(originalCwd);
    } catch {}
  });

  /**
   * RUN-01: run throws when required --task missing
   * @returns {Promise<void>}
   */
  it('RUN-01: run throws when required --task missing', async (): Promise<void> => {
    process.argv = ['node', 'p'];
    vi.resetModules();

    // mock Codex SDK to satisfy import
    vi.mock('codex-sdk', (): { Codex: new () => unknown } => ({
      Codex: class {},
    }));

    const cd = (await import('../src/codex-delegate')) as typeof import('../src/codex-delegate');

    await expect(cd.run()).rejects.toThrow('Missing required --task value.');
  });

  /**
   * RUN-02: run resolves and prints summaries & final response on success
   * @returns {Promise<void>}
   */
  it('RUN-02: run resolves and prints summaries & final response on success', async (): Promise<void> => {
    const fakeOut = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true as unknown as boolean);

    process.argv = ['node', 'p', '--task', 'do it'];
    vi.resetModules();

    // mock codex sdk
    vi.mock('codex-sdk', () => {
      return {
        Codex: class {
          /**
           * Start a stubbed thread implementation for tests.
           * @returns {unknown} A test thread object
           */
          startThread(): unknown {
            return (globalThis as unknown as Record<string, unknown>).__test_thread;
          }
        },
      };
    });

    (globalThis as unknown as Record<string, unknown>).__test_thread = {
      runStreamed: vi.fn().mockResolvedValue({
        events: makeEventStream([
          { type: 'item.completed', item: { type: 'command_execution', command: 'ls -la' } },
          { type: 'item.completed', item: { type: 'agent_message', text: 'Done' } },
          { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 2 } },
        ]),
      }),
    } as unknown as Record<string, unknown>;

    const cd = (await import('../src/codex-delegate')) as typeof import('../src/codex-delegate');

    await expect(cd.run()).resolves.toBeUndefined();

    const calls = fakeOut.mock.calls.map((c) => String(c[0])).join('');
    expect(calls).toContain('Commands:');
    expect(calls).toContain('- ls -la');
    expect(calls).toContain('Done');
    expect(calls).toContain('Usage: input 1, output 2');

    fakeOut.mockRestore();
  });

  /**
   * RUN-03: run throws when logFile path outside project
   * @returns {Promise<void>}
   */
  it('RUN-03: run throws when logFile path outside project', async (): Promise<void> => {
    process.argv = ['node', 'p', '--task', 'x', '--log-file', path.resolve('/etc/hosts')];
    vi.resetModules();

    vi.mock('codex-sdk', (): { Codex: new () => unknown } => ({
      Codex: class {},
    }));

    const cd = (await import('../src/codex-delegate')) as typeof import('../src/codex-delegate');

    await expect(cd.run()).rejects.toThrow('Log file path must be inside project directory.');
  });

  /**
   * RUN-04: main catches run's error and sets process.exitCode = 1 and writes message to stderr
   * @returns {Promise<void>}
   */
  it("RUN-04: main catches run's error and sets process.exitCode = 1 and writes message to stderr", async (): Promise<void> => {
    // ensure run's initial checks don't short-circuit
    process.argv = ['node', 'p', '--task', 'x'];

    vi.resetModules();

    vi.resetModules();

    // mock the codex sdk to return a controllable thread
    vi.mock('codex-sdk', () => ({
      Codex: class {
        /**
         * Start a stubbed thread implementation for tests.
         * @returns {unknown} A test thread object
         */
        startThread(): unknown {
          return (globalThis as unknown as Record<string, unknown>).__test_thread;
        }
      },
    }));

    (globalThis as unknown as Record<string, unknown>).__test_thread = {
      runStreamed: vi.fn().mockRejectedValue(new Error('boom')),
    } as unknown as Record<string, unknown>;

    const cd = (await import('../src/codex-delegate')) as typeof import('../src/codex-delegate');

    // cd.run should reject with boom
    await expect(cd.run()).rejects.toThrow('boom');

    const stderr = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true as unknown as boolean);

    await cd.main();

    expect(stderr).toHaveBeenCalledWith('boom\n');
    expect(process.exitCode).toBe(1);

    stderr.mockRestore();
  });

  /**
   * RUN-05: run does not validate --role when agent-prompts is missing
   * @returns {Promise<void>}
   */
  it('RUN-05: run does not validate --role when agent-prompts is missing', async (): Promise<void> => {
    process.argv = ['node', 'p', '--task', 'x', '--role', 'unknown-role'];

    // move cwd to a directory outside the project so listPromptRoles returns []
    const os = await import('node:os');
    process.chdir(os.tmpdir());

    vi.resetModules();

    // mock codex sdk
    vi.mock('codex-sdk', () => ({
      Codex: class {
        /**
         * Start a stubbed thread implementation for tests.
         * @returns {unknown} A test thread object
         */
        startThread(): unknown {
          return (globalThis as unknown as Record<string, unknown>).__test_thread;
        }
      },
    }));

    (globalThis as unknown as Record<string, unknown>).__test_thread = {
      runStreamed: vi.fn().mockResolvedValue({ events: emptyStream() }),
    } as unknown as Record<string, unknown>;

    const cd = (await import('../src/codex-delegate')) as typeof import('../src/codex-delegate');

    await expect(cd.run()).resolves.toBeUndefined();
  });

  /**
   * RUN-06: Codex integration: startThread and runStreamed invoked with expected arguments
   * @returns {Promise<void>}
   */
  it('RUN-06: Codex integration: startThread and runStreamed invoked with expected arguments', async (): Promise<void> => {
    process.argv = [
      'node',
      'p',
      '--task',
      'x',
      '--reasoning',
      'low',
      '--model',
      'm',
      '--structured',
    ];
    vi.resetModules();

    // capture args passed to startThread
    const slot = globalThis as unknown as {
      __startThreadArgs?: Record<string, unknown>;
      __test_thread?: { runStreamed?: (...args: unknown[]) => Promise<unknown> };
    };
    slot.__startThreadArgs = undefined;

    vi.mock('codex-sdk', (): { Codex: new () => unknown } => {
      return {
        Codex: class {
          /**
           * Start a stubbed thread implementation for tests.
           * @param opts Options passed by the runner
           * @returns {unknown} A test thread object
           */
          startThread(opts: Record<string, unknown>): unknown {
            (globalThis as unknown as Record<string, unknown>).__startThreadArgs = opts;
            return (globalThis as unknown as Record<string, unknown>).__test_thread;
          }
        },
      };
    });

    (globalThis as unknown as Record<string, unknown>).__test_thread = {
      runStreamed: vi.fn().mockResolvedValue({ events: emptyStream() }),
    } as unknown as Record<string, unknown>;

    const cd = (await import('../src/codex-delegate')) as typeof import('../src/codex-delegate');

    await expect(cd.run()).resolves.toBeUndefined();

    // assert startThread received reasoning mapped to modelReasoningEffort
    expect(slot.__startThreadArgs).toBeTruthy();
    expect((slot.__startThreadArgs as Record<string, unknown>).modelReasoningEffort).toBe('low');

    // assert runStreamed called with options object containing outputSchema
    const mockRun = slot.__test_thread!.runStreamed as unknown as {
      mock?: { calls?: unknown[][] };
    };
    expect(mockRun).toBeTruthy();
    expect((mockRun.mock!.calls as unknown[][])[0][1]).toBeTruthy();
    const callArg = (mockRun.mock!.calls as unknown[][])[0][1] as Record<string, unknown>;
    expect(callArg.outputSchema).toBeDefined();
  });
});
