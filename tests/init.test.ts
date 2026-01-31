import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const CONFIG_FILE_NAME = 'codex-delegate-config.json';

let originalCwd = '';
let tempDir = '';
let originalArgv: string[] = [];

/**
 * Resolve the config file path inside the provided base directory.
 *
 * @param {string} baseDir - Base directory to resolve from.
 * @returns {string} Full path to the config file.
 * @remarks
 * Uses the `.codex` folder within `baseDir`.
 * @example
 * const p = getConfigPath('/tmp/project');
 */
const getConfigPath = (baseDir: string): string => path.join(baseDir, '.codex', CONFIG_FILE_NAME);

/**
 * Write a JSON config file under the `.codex` directory.
 *
 * @param {string} baseDir - Base directory to write into.
 * @param {Record<string, unknown>} data - JSON-serialisable config data.
 * @returns {void}
 * @remarks
 * Ensures the `.codex` directory exists before writing.
 * @example
 * writeConfigFile('/tmp/project', { network: false });
 */
const writeConfigFile = (baseDir: string, data: Record<string, unknown>): void => {
  const configDir = path.join(baseDir, '.codex');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(getConfigPath(baseDir), JSON.stringify(data, null, 2));
};

/**
 * Mock the Codex SDK so tests do not require network access.
 *
 * @returns {void}
 * @remarks
 * Must be called before importing the module under test.
 * @example
 * mockCodexSdk();
 */
const mockCodexSdk = (): void => {
  vi.mock('@openai/codex-sdk', (): { Codex: new () => unknown } => ({
    Codex: class {},
  }));
};

beforeEach((): void => {
  originalCwd = process.cwd();
  originalArgv = process.argv;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-init-'));
  process.chdir(tempDir);
  vi.restoreAllMocks();
  vi.resetModules();
});

afterEach((): void => {
  process.argv = originalArgv;
  process.chdir(originalCwd);
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}
});

describe('Init subcommand', () => {
  /**
   * INIT-01: `init` creates `.codex` and the config file.
   *
   * @returns {Promise<void>}
   */
  it('INIT-01: init creates .codex and config file with defaults', async (): Promise<void> => {
    process.argv = ['node', 'p', 'init'];
    mockCodexSdk();

    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as unknown as never);

    const cd = (await import('../src/codex-delegate')) as typeof import('../src/codex-delegate');

    await expect(cd.run()).resolves.toBeUndefined();

    expect(fs.existsSync(getConfigPath(tempDir))).toBe(true);

    exitSpy.mockRestore();
  });

  /**
   * INIT-02: `init` does not create role markdown files.
   *
   * @returns {Promise<void>}
   */
  it('INIT-02: init does not create role markdown files', async (): Promise<void> => {
    process.argv = ['node', 'p', 'init'];
    mockCodexSdk();

    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as unknown as never);

    const cd = (await import('../src/codex-delegate')) as typeof import('../src/codex-delegate');

    await expect(cd.run()).resolves.toBeUndefined();

    const entries = fs.readdirSync(path.join(tempDir, '.codex'));
    const markdownFiles = entries.filter((entry) => entry.endsWith('.md'));
    expect(markdownFiles.length).toBe(0);

    exitSpy.mockRestore();
  });

  /**
   * INIT-03: Re-running init does not overwrite existing config.
   *
   * @returns {Promise<void>}
   */
  it('INIT-03: init is non-destructive when config already exists', async (): Promise<void> => {
    writeConfigFile(tempDir, { network: false, approval: 'on-request' });
    const before = fs.readFileSync(getConfigPath(tempDir), 'utf-8');

    process.argv = ['node', 'p', 'init'];
    mockCodexSdk();

    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as unknown as never);

    const cd = (await import('../src/codex-delegate')) as typeof import('../src/codex-delegate');

    await expect(cd.run()).resolves.toBeUndefined();

    const after = fs.readFileSync(getConfigPath(tempDir), 'utf-8');
    expect(after).toBe(before);

    exitSpy.mockRestore();
  });
});
