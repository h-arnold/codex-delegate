import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let originalCwd = '';
let tempDir = '';
let roleSources: {
  resolveTemplate: (roleId: string) => unknown | null;
};

/**
 * Resolve the temp `.codex` directory path.
 *
 * @param {string} rootDir - The temporary workspace root.
 * @returns {string} Absolute path to the `.codex` directory.
 * @remarks
 * This helper centralises the prompt directory path for test fixtures.
 * @example
 * const dir = codexDir(tempDir);
 */
const codexDir = (rootDir: string): string => path.join(rootDir, '.codex');

/**
 * Resolve the temp `.github/agents` directory path.
 *
 * @param {string} rootDir - The temporary workspace root.
 * @returns {string} Absolute path to the agents directory.
 * @remarks
 * Keeping this in one helper avoids path drift across tests.
 * @example
 * const dir = agentsDir(tempDir);
 */
const agentsDir = (rootDir: string): string => path.join(rootDir, '.github', 'agents');

/**
 * Ensure the `.codex` directory exists.
 *
 * @param {string} rootDir - The temporary workspace root.
 * @returns {string} Absolute path to the `.codex` directory.
 * @remarks
 * The directory is created recursively to keep test setup reliable.
 * @example
 * ensureCodexDir(tempDir);
 */
const ensureCodexDir = (rootDir: string): string => {
  const dir = codexDir(rootDir);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

/**
 * Ensure the `.github/agents` directory exists.
 *
 * @param {string} rootDir - The temporary workspace root.
 * @returns {string} Absolute path to the agents directory.
 * @remarks
 * The directory is created recursively so file creation order is irrelevant.
 * @example
 * ensureAgentsDir(tempDir);
 */
const ensureAgentsDir = (rootDir: string): string => {
  const dir = agentsDir(rootDir);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

/**
 * Write a `.codex` template file.
 *
 * @param {string} rootDir - The temporary workspace root.
 * @param {string} fileName - Markdown file name.
 * @param {string} contents - File contents.
 * @returns {string} Absolute path to the created file.
 * @remarks
 * The file is written synchronously to avoid timing issues in fixtures.
 * @example
 * writeCodexFile(tempDir, 'alpha.md', 'Alpha body');
 */
const writeCodexFile = (rootDir: string, fileName: string, contents: string): string => {
  const dir = ensureCodexDir(rootDir);
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, contents);
  return filePath;
};

/**
 * Write a Copilot agent markdown file.
 *
 * @param {string} rootDir - The temporary workspace root.
 * @param {string} fileName - File name including `.agent.md`.
 * @param {string} contents - File contents.
 * @returns {string} Absolute path to the created file.
 * @remarks
 * This helper ensures agents land in the discovery path consistently.
 * @example
 * writeAgentFile(tempDir, 'beta.agent.md', '---\\ndescription: Beta\\n---\\nBody');
 */
const writeAgentFile = (rootDir: string, fileName: string, contents: string): string => {
  const dir = ensureAgentsDir(rootDir);
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, contents);
  return filePath;
};

/**
 * Build a Copilot agent markdown payload with YAML front matter.
 *
 * @param {string[]} frontMatterLines - YAML lines without delimiters.
 * @param {string} body - Prompt body content.
 * @returns {string} Markdown content with front matter and body.
 * @remarks
 * Consistent front matter format keeps YAML parsing tests reliable.
 * @example
 * buildAgentContent(['description: Example'], 'Body');
 */
const buildAgentContent = (frontMatterLines: string[], body: string): string =>
  ['---', ...frontMatterLines, '---', '', body].join('\n');

beforeEach(async () => {
  originalCwd = process.cwd();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-resolve-'));
  process.chdir(tempDir);
  vi.resetModules();
  roleSources = (await import('../src/prompts/role-sources')) as unknown as {
    resolveTemplate: (roleId: string) => unknown | null;
  };
});

afterEach(() => {
  process.chdir(originalCwd);
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}
});

describe('Role Resolution', () => {
  it('RESOLVE-01: resolves .codex template when role exists only in .codex', () => {
    writeCodexFile(tempDir, 'alpha.md', 'Alpha body');
    const resolved = roleSources.resolveTemplate('alpha') as Record<string, unknown> | null;
    expect(resolved?.source).toBe('codex');
    expect(resolved?.prompt).toBe('Alpha body');
  });

  it('RESOLVE-02: resolves Copilot template body when role exists only in Copilot', () => {
    writeAgentFile(
      tempDir,
      'beta.agent.md',
      buildAgentContent(['description: Beta role'], 'Copilot body'),
    );
    const resolved = roleSources.resolveTemplate('beta') as Record<string, unknown> | null;
    expect(resolved?.source).toBe('copilot');
    expect(resolved?.prompt).toBe('Copilot body');
  });

  it('RESOLVE-03: resolves by precedence when role exists in both sources', () => {
    writeCodexFile(tempDir, 'shared.md', 'Codex body');
    writeAgentFile(
      tempDir,
      'shared.agent.md',
      buildAgentContent(['description: Copilot role'], 'Copilot body'),
    );
    const resolved = roleSources.resolveTemplate('shared') as Record<string, unknown> | null;
    expect(resolved?.source).toBe('codex');
    expect(resolved?.prompt).toBe('Codex body');
  });
});
