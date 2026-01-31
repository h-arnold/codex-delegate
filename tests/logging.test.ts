import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { emptyStream } from './helpers';
import * as cd from '../src/codex-delegate';

describe('Logging and Output helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('LOG-01: printSummaries prints formatted lists with expected prefixes', () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true as unknown as boolean);
    const results = {
      commands: ['cmd1', 'cmd2'],
      fileChanges: ['modified: a.ts'],
      toolCalls: ['server:tool'],
      webQueries: ['query1'],
      finalResponse: undefined,
      usageSummary: undefined,
    } as unknown as ReturnType<typeof cd.toStreamResults>;

    cd.printSummaries(results, { verbose: false } as unknown as Parameters<
      typeof cd.printSummaries
    >[1]);

    expect(write).toHaveBeenCalled();
    const calls = write.mock.calls.map((c) => String(c[0]));
    const out = calls.join('');
    expect(out).toContain('Commands:');
    expect(out).toContain('- cmd1');
    expect(out).toContain('File changes:');
    expect(out).toContain('Tool calls:');
    expect(out).toContain('Web searches:');
  });

  it('LOG-02: printSummaries suppresses output when options.verbose=true', () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true as unknown as boolean);
    const results = {
      commands: ['cmd1'],
      fileChanges: ['modified'],
      toolCalls: ['t'],
      webQueries: ['q'],
    } as unknown as Parameters<typeof cd.printSummaries>[0];

    cd.printSummaries(results, { verbose: true } as unknown as Parameters<
      typeof cd.printSummaries
    >[1]);

    expect(write).not.toHaveBeenCalled();
  });

  it('LOG-03: printSummaries respects options.maxItems limit', () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true as unknown as boolean);
    const results = {
      commands: ['a', 'b', 'c'],
      fileChanges: ['f1', 'f2', 'f3'],
      toolCalls: ['t1', 't2', 't3'],
      webQueries: ['w1', 'w2', 'w3'],
    } as unknown as Parameters<typeof cd.printSummaries>[0];

    cd.printSummaries(results, { verbose: false, maxItems: 2 } as unknown as Parameters<
      typeof cd.printSummaries
    >[1]);

    const calls = write.mock.calls.map((c) => String(c[0]));
    const out = calls.join('');
    expect(out).toContain('- a\n- b');
    expect(out).not.toContain('- c');
    expect(out).toContain('- f1\n- f2');
  });

  it('LOG-04: printFinalResponse when schema present attempts JSON parse and pretty prints', () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true as unknown as boolean);
    const results = { finalResponse: JSON.stringify({ a: 1, b: 2 }) } as unknown as Parameters<
      typeof cd.printFinalResponse
    >[0];

    cd.printFinalResponse(results, {} as unknown as Parameters<typeof cd.printFinalResponse>[1]);

    const calls = write.mock.calls.map((c) => String(c[0]));
    const out = calls.join('');
    // pretty-printed JSON should include keys and indentation
    expect(out).toContain('{');
    expect(out).toContain('"a": 1');
    expect(out).toContain('"b": 2');
  });

  it('LOG-05: printFinalResponse falls back to raw text on parse error', () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true as unknown as boolean);
    const results = { finalResponse: 'not-json' } as unknown as Parameters<
      typeof cd.printFinalResponse
    >[0];

    cd.printFinalResponse(results, {} as unknown as Parameters<typeof cd.printFinalResponse>[1]);

    expect(write).toHaveBeenCalledWith('not-json\n');
  });

  it('LOG-06: tailLogFile returns last N lines or [] for missing file', () => {
    const tmp = path.join(process.cwd(), 'tests', 'tail-test.log');
    const lines = Array.from({ length: 10 }, (_, i) => `line-${i + 1}`);
    fs.writeFileSync(tmp, lines.join('\n'));

    const tail = cd.tailLogFile(tmp, 5);
    expect(tail).toEqual(['line-6', 'line-7', 'line-8', 'line-9', 'line-10']);

    // missing file
    const missing = cd.tailLogFile(path.join(process.cwd(), 'tests', 'nope-234234.log'), 5);
    expect(missing).toEqual([]);

    // cleanup
    fs.unlinkSync(tmp);
  });

  it('LOG-07: tailLogFile returns [] when path resolves outside project', () => {
    const outside = path.resolve('/etc/hosts');
    const tail = cd.tailLogFile(outside, 5);
    expect(tail).toEqual([]);
  });

  it('LOG-08: tailLogFile returns [] for an empty file (exists but no content)', () => {
    const tmp = path.join(process.cwd(), 'tests', 'tail-empty.log');
    fs.writeFileSync(tmp, '');
    const tail = cd.tailLogFile(tmp, 5);
    expect(tail).toEqual([]);
    fs.unlinkSync(tmp);
  });

  it('LOG-09: run cleans up logStream and intervals even when processStream throws', async () => {
    // set process.argv to provide the required options
    const fakeLog = path.join(process.cwd(), 'tests', 'run-log.log');
    const originalArgv = process.argv;
    process.argv = ['node', 'p', '--task', 'x', '--log-file', fakeLog];

    // reset module registry and mock the Codex class before importing the module under test
    vi.resetModules();

    // mock the codex sdk to return a controllable thread via a global slot
    vi.mock('@openai/codex-sdk', () => {
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

    // spy on WriteStream.prototype.end so we can detect cleanup
    const endSpy = vi.spyOn(fs.WriteStream.prototype, 'end').mockImplementation(function (
      this: unknown,
      ..._args: unknown[]
    ) {
      // noop; we only observe that `end` was invoked
      return undefined;
    });

    const { makeEventStream } = await import('./helpers');

    // set up the thread to return a stream that will cause processStream to throw
    (globalThis as unknown as Record<string, unknown>).__test_thread = {
      runStreamed: vi.fn().mockResolvedValue({
        events: makeEventStream([{ type: 'turn.failed', error: { message: 'boom' } }]),
      }),
    } as unknown as Record<string, unknown>;

    // import a fresh copy of the module under test so our mock is used
    const cd2 = (await import('../src/codex-delegate')) as typeof cd;

    const clearSpy = vi.spyOn(global, 'clearInterval').mockImplementation(() => {});

    await expect(cd2.run()).rejects.toThrow('boom');

    expect(endSpy).toHaveBeenCalled();
    expect(clearSpy).toHaveBeenCalled();

    // restore argv
    process.argv = originalArgv;

    // cleanup
    if (fs.existsSync(fakeLog)) fs.unlinkSync(fakeLog);
  });
});
