import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { makeEventStream, emptyStream } from './helpers';

// Each test will reset module registry and mock the Codex SDK where needed.

describe('Runner (run / main) behavior', () => {
  const JSON_INDENT_SPACES = 2;
  const originalArgv = process.argv;
  const originalCwd = process.cwd();
  let tempDir = '';
  let codexDir = '';
  let codexDirExisted = false;
  const createdCodexFiles = new Set<string>();
  let createdCodexDir = false;

  /**
   * Ensure the `.codex` directory exists for role files.
   *
   * @returns {void}
   * @remarks
   * Tracks whether the directory was created for cleanup.
   * @example
   * ensureCodexDir();
   */
  const ensureCodexDir = (): void => {
    if (!fs.existsSync(codexDir)) {
      fs.mkdirSync(codexDir, { recursive: true });
      if (!codexDirExisted) {
        createdCodexDir = true;
      }
    }
  };

  /**
   * Write a role markdown file under `.codex` for tests.
   *
   * @param {string} fileName - Role file name to create.
   * @param {string} contents - File contents.
   * @returns {string} Full path to the created file.
   * @remarks
   * Ensures the `.codex` directory exists.
   * @example
   * writeRoleFile('review.md', 'Role instructions');
   */
  const writeRoleFile = (fileName: string, contents: string): string => {
    ensureCodexDir();
    const filePath = path.join(codexDir, fileName);
    fs.writeFileSync(filePath, contents);
    createdCodexFiles.add(filePath);
    return filePath;
  };

  /**
   * Write a Codex delegate config file under `.codex`.
   *
   * @param {Record<string, unknown>} config - Config values to write.
   * @returns {string} Full path to the created config file.
   * @remarks
   * Ensures the `.codex` directory exists before writing.
   * @example
   * writeConfigFile({ overrideWireApi: false });
   */
  const writeConfigFile = (config: Record<string, unknown>): string => {
    ensureCodexDir();
    const filePath = path.join(codexDir, 'codex-delegate-config.json');
    fs.writeFileSync(filePath, JSON.stringify(config, null, JSON_INDENT_SPACES));
    createdCodexFiles.add(filePath);
    return filePath;
  };

  /**
   * Clean up any `.codex` role files created during tests.
   *
   * @returns {void}
   * @remarks
   * Removes the `.codex` directory only if the tests created it and it is empty.
   * @example
   * cleanupCodexDir();
   */
  const cleanupCodexDir = (): void => {
    removeCreatedCodexFiles();
    removeCreatedCodexDirIfEmpty();
    createdCodexDir = false;
  };

  /**
   * Remove the `.codex` files created during tests.
   *
   * @returns {void}
   * @remarks
   * Uses best-effort cleanup to avoid test failures from transient filesystem errors.
   * @example
   * removeCreatedCodexFiles();
   */
  const removeCreatedCodexFiles = (): void => {
    for (const filePath of createdCodexFiles) {
      try {
        fs.rmSync(filePath, { force: true });
      } catch {}
    }
    createdCodexFiles.clear();
  };

  /**
   * Remove the `.codex` directory if the tests created it and it is empty.
   *
   * @returns {void}
   * @remarks
   * Leaves the directory in place if removal fails or it contains files.
   * @example
   * removeCreatedCodexDirIfEmpty();
   */
  const removeCreatedCodexDirIfEmpty = (): void => {
    if (!createdCodexDir) {
      return;
    }
    if (!fs.existsSync(codexDir)) {
      return;
    }
    if (fs.readdirSync(codexDir).length !== 0) {
      return;
    }
    try {
      fs.rmdirSync(codexDir);
    } catch {}
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.exitCode = 0;
    createdCodexFiles.clear();
    createdCodexDir = false;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-run-'));
    process.chdir(tempDir);
    codexDir = path.join(tempDir, '.codex');
    codexDirExisted = fs.existsSync(codexDir);
  });

  afterEach(() => {
    process.argv = originalArgv;
    try {
      process.chdir(originalCwd);
    } catch {}
    cleanupCodexDir();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  /**
   * RUN-LEGACY-01: run throws when required --task missing
   * @returns {Promise<void>}
   */
  it('RUN-LEGACY-01: run throws when required --task missing', async (): Promise<void> => {
    process.argv = ['node', 'p'];
    vi.resetModules();

    // mock Codex SDK to satisfy import
    vi.doMock('@openai/codex-sdk', (): { Codex: new () => unknown } => ({
      Codex: class {},
    }));

    const cd = (await import('../src/codex-delegate')) as typeof import('../src/codex-delegate');

    await expect(cd.run()).rejects.toThrow('Missing required --task value.');
  });

  /**
   * RUN-LEGACY-02: run resolves and prints summaries & final response on success
   * @returns {Promise<void>}
   */
  it('RUN-LEGACY-02: run resolves and prints summaries & final response on success', async (): Promise<void> => {
    const fakeOut = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true as unknown as boolean);

    process.argv = ['node', 'p', '--task', 'do it'];
    vi.resetModules();

    // mock codex sdk
    vi.doMock('@openai/codex-sdk', () => {
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
   * RUN-CONFIG-05: run defaults to overriding wire_api to responses.
   * @returns {Promise<void>}
   */
  it('RUN-CONFIG-05: run defaults to overriding wire_api to responses', async (): Promise<void> => {
    process.argv = ['node', 'p', '--task', 'x'];
    vi.resetModules();

    const codexConstructorSpy = vi.fn();

    vi.doMock('@openai/codex-sdk', () => {
      return {
        Codex: class {
          /**
           * Record the constructor configuration for inspection.
           *
           * @param {unknown} config - Configuration passed to Codex.
           * @returns {void}
           * @remarks
           * The test inspects the captured config to confirm wire_api behaviour.
           * @example
           * new Codex({ config: { wire_api: 'responses' } });
           */
          constructor(config: unknown) {
            codexConstructorSpy(config);
          }

          /**
           * Start a stubbed thread implementation for tests.
           *
           * @returns {unknown} A test thread object.
           */
          startThread(): unknown {
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

    const ctorArg = codexConstructorSpy.mock.calls[0]?.[0] as
      | { config?: { wire_api?: string } }
      | undefined;
    expect(ctorArg?.config?.wire_api).toBe('responses');
  });

  /**
   * RUN-CONFIG-06: config disables wire_api override and preserves existing configuration.
   * @returns {Promise<void>}
   */
  it('RUN-CONFIG-06: config disables wire_api override and preserves existing configuration', async (): Promise<void> => {
    writeConfigFile({ overrideWireApi: false });
    process.argv = ['node', 'p', '--task', 'x'];
    vi.resetModules();

    const codexConstructorSpy = vi.fn();

    vi.doMock('@openai/codex-sdk', () => {
      return {
        Codex: class {
          /**
           * Record the constructor configuration for inspection.
           *
           * @param {unknown} config - Configuration passed to Codex.
           * @returns {void}
           * @remarks
           * The test inspects the captured config to confirm wire_api behaviour.
           * @example
           * new Codex({ config: { wire_api: 'responses' } });
           */
          constructor(config: unknown) {
            codexConstructorSpy(config);
          }

          /**
           * Start a stubbed thread implementation for tests.
           *
           * @returns {unknown} A test thread object.
           */
          startThread(): unknown {
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

    const ctorArg = codexConstructorSpy.mock.calls[0]?.[0] as
      | { config?: { wire_api?: string } }
      | undefined;
    expect(ctorArg?.config?.wire_api).toBeUndefined();
  });

  /**
   * RUN-LEGACY-03: run throws when logFile path outside project
   * @returns {Promise<void>}
   */
  it('RUN-LEGACY-03: run throws when logFile path outside project', async (): Promise<void> => {
    process.argv = ['node', 'p', '--task', 'x', '--log-file', path.resolve('/etc/hosts')];
    vi.resetModules();

    vi.doMock('@openai/codex-sdk', (): { Codex: new () => unknown } => ({
      Codex: class {},
    }));

    const cd = (await import('../src/codex-delegate')) as typeof import('../src/codex-delegate');

    await expect(cd.run()).rejects.toThrow('Log file path must be inside project directory.');
  });

  /**
   * RUN-LEGACY-04: main catches run's error and sets process.exitCode = 1 and writes message to stderr
   * @returns {Promise<void>}
   */
  it("RUN-LEGACY-04: main catches run's error and sets process.exitCode = 1 and writes message to stderr", async (): Promise<void> => {
    // ensure run's initial checks don't short-circuit
    process.argv = ['node', 'p', '--task', 'x'];

    vi.resetModules();

    vi.resetModules();

    // mock the codex sdk to return a controllable thread
    vi.doMock('@openai/codex-sdk', () => ({
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
   * RUN-LEGACY-05: run does not validate --role when agent-prompts is missing
   * @returns {Promise<void>}
   */
  it('RUN-LEGACY-05: run does not validate --role when agent-prompts is missing', async (): Promise<void> => {
    process.argv = ['node', 'p', '--task', 'x', '--role', 'unknown-role'];

    // move cwd to a directory outside the project so listPromptRoles returns []
    const os = await import('node:os');
    process.chdir(os.tmpdir());

    vi.resetModules();

    // mock codex sdk
    vi.doMock('@openai/codex-sdk', () => ({
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
   * RUN-LEGACY-06: Codex integration: startThread and runStreamed invoked with expected arguments
   * @returns {Promise<void>}
   */
  it('RUN-LEGACY-06: Codex integration: startThread and runStreamed invoked with expected arguments', async (): Promise<void> => {
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

    vi.doMock('@openai/codex-sdk', (): { Codex: new () => unknown } => {
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

  /**
   * RUN-01: warn when no roles exist and continue without role instructions.
   *
   * @returns {Promise<void>}
   */
  it('RUN-01: warns when no roles exist and continues', async (): Promise<void> => {
    process.argv = ['node', 'p', '--task', 'x'];
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-no-roles-'));
    process.chdir(tempDir);

    vi.resetModules();

    vi.doMock('@openai/codex-sdk', () => ({
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

    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true as unknown as boolean);
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true as unknown as boolean);

    const cd = (await import('../src/codex-delegate')) as typeof import('../src/codex-delegate');

    await expect(cd.run()).resolves.toBeUndefined();

    const stdoutText = stdoutSpy.mock.calls.map((call) => String(call[0])).join('');
    const stderrText = stderrSpy.mock.calls.map((call) => String(call[0])).join('');
    expect(stdoutText + stderrText).toMatch(/no roles/i);

    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /**
   * RUN-02: unknown role throws when roles exist.
   *
   * @returns {Promise<void>}
   */
  it('RUN-02: unknown role throws when roles exist', async (): Promise<void> => {
    writeRoleFile('review.md', 'Review role');
    process.argv = ['node', 'p', '--task', 'x', '--role', 'unknown-role'];
    vi.resetModules();

    vi.doMock('@openai/codex-sdk', (): { Codex: new () => unknown } => ({
      Codex: class {},
    }));

    const cd = (await import('../src/codex-delegate')) as typeof import('../src/codex-delegate');

    await expect(cd.run()).rejects.toThrow(/Available roles:/);
  });

  /**
   * RUN-03: list-roles reports available roles from `.codex`.
   *
   * @returns {Promise<void>}
   */
  it('RUN-03: list-roles reports available roles from .codex', async (): Promise<void> => {
    writeRoleFile('review.md', 'Review role');
    vi.resetModules();

    vi.doMock('@openai/codex-sdk', (): { Codex: new () => unknown } => ({
      Codex: class {},
    }));

    const cd = (await import('../src/codex-delegate')) as typeof import('../src/codex-delegate');

    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as unknown as never);

    cd.handleImmediateFlag('--list-roles');

    const output = infoSpy.mock.calls.map((call) => String(call[0])).join('');
    expect(output).toContain('review');

    infoSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
