import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { makeEventStream, emptyStream } from './helpers';

describe('Integration / End-to-End Scenarios', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * E2E-01: Full run with structured output using default schema
   * @returns {Promise<void>}
   */
  it('E2E-01: Full run with structured output using default schema', async (): Promise<void> => {
    const originalArgv = process.argv;
    process.argv = ['node', 'p', '--task', 'x', '--structured'];

    vi.resetModules();

    // Provide a controllable test thread via global slot
    (globalThis as unknown as Record<string, unknown>).__test_thread = {
      runStreamed: vi.fn().mockResolvedValue({
        events: makeEventStream([
          { type: 'item.completed', item: { type: 'command_execution', command: 'echo hi' } },
          {
            type: 'item.completed',
            item: {
              type: 'agent_message',
              text: JSON.stringify({ summary: 'ok', status: 'done' }),
            },
          },
          { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 2 } },
        ]),
      }),
    } as unknown as Record<string, unknown>;

    vi.mock('@openai/codex-sdk', () => ({
      Codex: class {
        /**
         * @returns {unknown}
         */
        startThread(): unknown {
          return (globalThis as unknown as Record<string, unknown>).__test_thread;
        }
      },
    }));

    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true as unknown as boolean);

    const cd = await import('../src/codex-delegate');

    await cd.run();

    const out = write.mock.calls.map((c) => String(c[0])).join('');
    expect(out).toContain('Commands:');
    expect(out).toContain('- echo hi');
    // structured JSON pretty-printed should include keys
    expect(out).toContain('"summary": "ok"');
    expect(out).toContain('"status": "done"');
    expect(out).toContain('Usage: input 1, output 2');

    process.argv = originalArgv;
  });

  /**
   * E2E-02: Full run where delegate fails mid-stream
   * @returns {Promise<void>}
   */
  it('E2E-02: Full run where delegate fails mid-stream', async (): Promise<void> => {
    const originalArgv = process.argv;
    process.argv = ['node', 'p', '--task', 'x'];

    vi.resetModules();

    (globalThis as unknown as Record<string, unknown>).__test_thread = {
      runStreamed: vi.fn().mockImplementation(() =>
        Promise.resolve({
          events: makeEventStream([{ type: 'turn.failed', error: { message: 'delegate-boom' } }]),
        }),
      ),
    } as unknown as Record<string, unknown>;

    vi.mock('@openai/codex-sdk', () => ({
      Codex: class {
        /**
         * @returns {unknown}
         */
        startThread(): unknown {
          return (globalThis as unknown as Record<string, unknown>).__test_thread;
        }
      },
    }));

    const cd = await import('../src/codex-delegate');

    await expect(cd.run()).rejects.toThrow('delegate-boom');

    // Now test main() catches and sets exit code and writes to stderr
    const stderr = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true as unknown as boolean);

    // call main which should catch the error and set process.exitCode
    await cd.main();
    // allow any synchronous microtasks to complete
    await Promise.resolve();
    expect(process.exitCode).toBe(1);
    expect(stderr).toHaveBeenCalledWith('delegate-boom\n');

    process.exitCode = 0; // reset
    process.argv = originalArgv;
  });

  /**
   * E2E-03: Logging progress interval prints tail lines when logStream present
   * @returns {Promise<void>}
   */
  it('E2E-03: Logging progress interval prints tail lines when logStream present', async (): Promise<void> => {
    const INTERVAL_HANDLE_ID = 123;
    const originalArgv = process.argv;
    const tmp = path.join(process.cwd(), 'tests', 'e2e-log.log');
    const lines = Array.from({ length: 6 }, (_, i) => `line-${i + 1}`);
    fs.writeFileSync(tmp, lines.join('\n'));

    process.argv = ['node', 'p', '--task', 'x', '--log-file', tmp];

    vi.resetModules();

    // Make the thread return an empty event stream so run() completes
    (globalThis as unknown as Record<string, unknown>).__test_thread = {
      runStreamed: vi.fn().mockResolvedValue({ events: emptyStream() }),
    } as unknown as Record<string, unknown>;

    vi.mock('@openai/codex-sdk', () => ({
      Codex: class {
        /**
         * @returns {unknown}
         */
        startThread(): unknown {
          return (globalThis as unknown as Record<string, unknown>).__test_thread;
        }
      },
    }));

    // Spy on setInterval to invoke callback immediately when registered so the progress
    // message is printed during the run.
    const setSpy = vi.spyOn(global, 'setInterval').mockImplementation(((
      fn: (...args: unknown[]) => void,
    ) => {
      fn();
      return INTERVAL_HANDLE_ID as unknown as NodeJS.Timeout;
    }) as typeof setInterval);

    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true as unknown as boolean);
    const clearSpy = vi.spyOn(global, 'clearInterval').mockImplementation(() => {});

    const cd = await import('../src/codex-delegate');

    await cd.run();

    const out = write.mock.calls.map((c) => String(c[0])).join('');
    expect(out).toContain('Sub-agent progress (last 5 log lines):');
    expect(out).toContain('line-2');
    expect(clearSpy).toHaveBeenCalled();

    // cleanup
    fs.unlinkSync(tmp);
    process.argv = originalArgv;
  });
});
