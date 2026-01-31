import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const CONFIG_FILE_NAME = 'codex-delegate-config.json';

let originalCwd = '';
let tempDir = '';

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
 * Write raw config contents without validating JSON.
 *
 * @param {string} baseDir - Base directory to write into.
 * @param {string} raw - Raw file contents.
 * @returns {void}
 * @remarks
 * Use this helper to create malformed JSON for tests.
 * @example
 * writeRawConfig('/tmp/project', '{invalid');
 */
const writeRawConfig = (baseDir: string, raw: string): void => {
  const configDir = path.join(baseDir, '.codex');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(getConfigPath(baseDir), raw);
};

beforeEach((): void => {
  originalCwd = process.cwd();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-config-'));
  process.chdir(tempDir);
  vi.restoreAllMocks();
  vi.resetModules();
});

afterEach((): void => {
  process.chdir(originalCwd);
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}
});

describe('Config defaults and precedence', () => {
  /**
   * CFG-01: Missing config file is auto-created with defaults.
   *
   * @returns {Promise<void>}
   */
  it('CFG-01: missing config file is created before parsing completes', async (): Promise<void> => {
    const { parseArgs } = await import('../src/cli/options');
    parseArgs([]);
    expect(fs.existsSync(getConfigPath(tempDir))).toBe(true);
  });

  /**
   * CFG-02: Defaults are loaded from config when CLI flags absent.
   *
   * @returns {Promise<void>}
   */
  it('CFG-02: defaults load from config when no CLI flags provided', async (): Promise<void> => {
    writeConfigFile(tempDir, {
      network: false,
      webSearch: 'disabled',
      sandbox: 'read-only',
      approval: 'on-request',
      timeoutMinutes: 5.5,
      verbose: true,
      structured: true,
      model: 'gpt-test',
    });

    const { parseArgs } = await import('../src/cli/options');
    const opts = parseArgs([]);

    expect(opts.network).toBe(false);
    expect(opts.webSearch).toBe('disabled');
    expect(opts.sandbox).toBe('read-only');
    expect(opts.approval).toBe('on-request');
    expect(opts.timeoutMinutes).toBe(5.5);
    expect(opts.verbose).toBe(true);
    expect(opts.structured).toBe(true);
    expect(opts.model).toBe('gpt-test');
  });

  /**
   * CFG-03: CLI flags override config values.
   *
   * @returns {Promise<void>}
   */
  it('CFG-03: CLI flags override config defaults', async (): Promise<void> => {
    writeConfigFile(tempDir, {
      network: false,
      webSearch: 'disabled',
      sandbox: 'read-only',
      approval: 'on-request',
      timeoutMinutes: 12,
    });

    const { parseArgs } = await import('../src/cli/options');
    const opts = parseArgs([
      '--network',
      'true',
      '--web-search',
      'live',
      '--sandbox',
      'danger-full-access',
      '--approval',
      'never',
      '--timeout-minutes',
      '3',
    ]);

    expect(opts.network).toBe(true);
    expect(opts.webSearch).toBe('live');
    expect(opts.sandbox).toBe('danger-full-access');
    expect(opts.approval).toBe('never');
    expect(opts.timeoutMinutes).toBe(3);
  });

  /**
   * CFG-04: Role is never loaded from config.
   *
   * @returns {Promise<void>}
   */
  it('CFG-04: role defaults to implementation when only config sets it', async (): Promise<void> => {
    writeConfigFile(tempDir, {
      role: 'review',
      network: false,
    });

    const { parseArgs } = await import('../src/cli/options');
    const opts = parseArgs([]);

    expect(opts.role).toBe('implementation');
  });

  /**
   * CFG-05: Malformed JSON config falls back to defaults.
   *
   * @returns {Promise<void>}
   */
  it('CFG-05: invalid JSON config falls back to defaults', async (): Promise<void> => {
    writeRawConfig(tempDir, '{invalid');

    const { parseArgs } = await import('../src/cli/options');
    const opts = parseArgs([]);

    expect(opts.network).toBe(true);
    expect(opts.webSearch).toBe('live');
    expect(opts.sandbox).toBe('danger-full-access');
    expect(opts.approval).toBe('never');
    expect(opts.timeoutMinutes).toBe(10);
  });
});
