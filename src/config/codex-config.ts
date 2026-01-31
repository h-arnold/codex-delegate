import fs from 'node:fs';
import path from 'node:path';

import { DEFAULT_OPTIONS } from './default-options.js';
import type { DelegateOptions } from '../types/delegate-options.js';

/**
 * Config shape for persisted `.codex` settings.
 *
 * @remarks
 * The persisted config intentionally excludes `role`, `task`, and `instructions`.
 */
type CodexDelegateConfig = Omit<DelegateOptions, 'role' | 'task' | 'instructions'>;

/**
 * File name used for the Codex delegate JSON config file.
 */
const CONFIG_FILE_NAME = 'codex-delegate-config.json';

/**
 * Resolve the `.codex` configuration directory for the current working directory.
 *
 * @returns {string} Absolute path to the `.codex` directory.
 * @remarks
 * Uses the current working directory to keep config local to the project.
 * @example
 * const dir = getCodexConfigDir();
 */
function getCodexConfigDir(): string {
  return path.join(process.cwd(), '.codex');
}

/**
 * Resolve the path to the Codex delegate config file.
 *
 * @returns {string} Absolute path to `.codex/codex-delegate-config.json`.
 * @remarks
 * The path is based on the current working directory.
 * @example
 * const file = getCodexConfigPath();
 */
function getCodexConfigPath(): string {
  return path.join(getCodexConfigDir(), CONFIG_FILE_NAME);
}

/**
 * Produce the default config values from the CLI defaults.
 *
 * @returns {CodexDelegateConfig} Default config values derived from CLI defaults.
 * @remarks
 * The defaults omit `role`, `task`, and `instructions` as they are CLI-only.
 * @example
 * const defaults = getConfigDefaults();
 */
function getConfigDefaults(): CodexDelegateConfig {
  const { role, task, instructions, ...defaults } = DEFAULT_OPTIONS;
  return { ...defaults };
}

/**
 * Check whether a value is a plain object record.
 *
 * @param {unknown} value - Value to test.
 * @returns {boolean} `true` when the value is a non-null object.
 * @remarks
 * Arrays are rejected by this helper.
 * @example
 * isRecord({}) // => true
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Normalise raw JSON data into a typed Codex config object.
 *
 * @param {Record<string, unknown>} raw - Parsed JSON data.
 * @returns {CodexDelegateConfig} Filtered config values with known keys only.
 * @remarks
 * Unknown or mismatched value types are ignored to keep config safe.
 * @example
 * const config = normaliseConfig({ network: true });
 */
function normaliseConfig(raw: Record<string, unknown>): CodexDelegateConfig {
  const config: CodexDelegateConfig = {};
  if (typeof raw.model === 'string') {
    config.model = raw.model;
  }
  if (typeof raw.reasoning === 'string') {
    config.reasoning = raw.reasoning;
  }
  if (typeof raw.workingDir === 'string') {
    config.workingDir = raw.workingDir;
  }
  if (typeof raw.sandbox === 'string') {
    config.sandbox = raw.sandbox as DelegateOptions['sandbox'];
  }
  if (typeof raw.approval === 'string') {
    config.approval = raw.approval as DelegateOptions['approval'];
  }
  if (typeof raw.network === 'boolean') {
    config.network = raw.network;
  }
  if (typeof raw.webSearch === 'string') {
    config.webSearch = raw.webSearch as DelegateOptions['webSearch'];
  }
  if (typeof raw.verbose === 'boolean') {
    config.verbose = raw.verbose;
  }
  if (typeof raw.structured === 'boolean') {
    config.structured = raw.structured;
  }
  if (typeof raw.schemaFile === 'string') {
    config.schemaFile = raw.schemaFile;
  }
  if (typeof raw.logFile === 'string') {
    config.logFile = raw.logFile;
  }
  if (typeof raw.maxItems === 'number' && Number.isFinite(raw.maxItems)) {
    config.maxItems = raw.maxItems;
  }
  if (typeof raw.overrideWireApi === 'boolean') {
    config.overrideWireApi = raw.overrideWireApi;
  }
  if (
    typeof raw.timeoutMinutes === 'number' &&
    Number.isFinite(raw.timeoutMinutes) &&
    raw.timeoutMinutes > 0
  ) {
    config.timeoutMinutes = raw.timeoutMinutes;
  }
  return config;
}

/**
 * Read the Codex delegate config file from disk.
 *
 * @returns {CodexDelegateConfig} Parsed configuration, or defaults on failure.
 * @remarks
 * Missing or malformed JSON returns defaults instead of throwing.
 * @example
 * const config = readCodexConfig();
 */
function readCodexConfig(): CodexDelegateConfig {
  const defaults = getConfigDefaults();
  try {
    const configPath = getCodexConfigPath();
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- config path is constructed from the current working directory
    const contents = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(contents) as unknown;
    if (!isRecord(parsed)) {
      return defaults;
    }
    const overrides = normaliseConfig(parsed);
    return { ...defaults, ...overrides };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return defaults;
    }
    if (error instanceof SyntaxError) {
      return defaults;
    }
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Warning: Failed to read config file, using defaults. Error: ${message}`);
    return defaults;
  }
}

/**
 * Write the Codex delegate config to disk.
 *
 * @param {CodexDelegateConfig} config - Config data to write.
 * @returns {void}
 * @remarks
 * Uses stable two-space indentation for easy diffs.
 * @example
 * writeCodexConfig({ network: false });
 */
function writeCodexConfig(config: CodexDelegateConfig): void {
  const configDir = getCodexConfigDir();
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- config path is constructed from the current working directory
  fs.mkdirSync(configDir, { recursive: true });
  const configPath = getCodexConfigPath();
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- config path is constructed from the current working directory
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

/**
 * Ensure the Codex config file exists and return its contents.
 *
 * @returns {CodexDelegateConfig} Config data from disk or defaults if created.
 * @remarks
 * Creates the `.codex` directory and config file when missing.
 * @example
 * const config = ensureCodexConfig();
 */
function ensureCodexConfig(): CodexDelegateConfig {
  const configPath = getCodexConfigPath();
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- config path is constructed from the current working directory
  if (fs.existsSync(configPath)) {
    return readCodexConfig();
  }
  const defaults = getConfigDefaults();
  writeCodexConfig(defaults);
  return defaults;
}

export {
  CONFIG_FILE_NAME,
  ensureCodexConfig,
  getCodexConfigDir,
  getCodexConfigPath,
  getConfigDefaults,
  readCodexConfig,
  writeCodexConfig,
};
export type { CodexDelegateConfig };
