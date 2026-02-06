import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let originalCwd = '';
let tempDir = '';
let roleSources: {
  listRoles: () => unknown[];
  resolveTemplate: (roleId: string) => unknown | null;
};

/**
 * Resolve the temp `.codex` directory path.
 *
 * @param {string} rootDir - The temporary workspace root.
 * @returns {string} Absolute path to the `.codex` directory.
 * @remarks
 * This helper centralises the test path so fixtures stay consistent.
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
 * This keeps Copilot agent fixtures isolated to the temp workspace.
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
 * The directory is created recursively to keep fixtures deterministic.
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
 * The directory is created recursively so tests can create files in any order.
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
 * The file is written synchronously to avoid timing issues in tests.
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
 * This helper ensures agents are created in the correct directory for discovery.
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
 * This ensures the front matter format is consistent across fixtures.
 * @example
 * buildAgentContent(['description: Example'], 'Body');
 */
const buildAgentContent = (frontMatterLines: string[], body: string): string =>
  ['---', ...frontMatterLines, '---', '', body].join('\n');

beforeEach(async () => {
  originalCwd = process.cwd();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-roles-'));
  process.chdir(tempDir);
  vi.resetModules();
  roleSources = (await import('../src/prompts/role-sources')) as unknown as {
    listRoles: () => unknown[];
    resolveTemplate: (roleId: string) => unknown | null;
  };
});

afterEach(() => {
  process.chdir(originalCwd);
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}
});

describe('Role Aggregation', () => {
  it('AGG-01: merges .codex and Copilot roles into one list', () => {
    writeCodexFile(tempDir, 'alpha.md', 'Alpha body');
    writeAgentFile(
      tempDir,
      'bravo.agent.md',
      buildAgentContent(['description: Bravo role'], 'Bravo body'),
    );
    const roles = roleSources.listRoles() as Array<Record<string, unknown>>;
    const roleIds = roles.map((role) => role.id);
    expect(roleIds).toContain('alpha');
    expect(roleIds).toContain('bravo');
  });

  it('AGG-02: returns deterministic sorting (alphabetical by role id)', () => {
    writeCodexFile(tempDir, 'gamma.md', 'Gamma body');
    writeCodexFile(tempDir, 'alpha.md', 'Alpha body');
    writeAgentFile(
      tempDir,
      'beta.agent.md',
      buildAgentContent(['description: Beta role'], 'Beta body'),
    );
    const roles = roleSources.listRoles() as Array<Record<string, unknown>>;
    expect(roles.map((role) => role.id)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('AGG-03: enforces precedence on identifier collisions', () => {
    writeCodexFile(tempDir, 'shared.md', 'Codex wins');
    writeAgentFile(
      tempDir,
      'shared.agent.md',
      buildAgentContent(['description: Copilot shared'], 'Copilot body'),
    );
    const resolved = roleSources.resolveTemplate('shared') as Record<string, unknown> | null;
    expect(resolved?.source).toBe('codex');
    expect(resolved?.prompt).toBe('Codex wins');
  });

  it('AGG-04: preserves source metadata for each role', () => {
    writeCodexFile(tempDir, 'alpha.md', 'Alpha body');
    writeAgentFile(
      tempDir,
      'bravo.agent.md',
      buildAgentContent(['description: Bravo role'], 'Bravo body'),
    );
    const roles = roleSources.listRoles() as Array<Record<string, unknown>>;
    const codexRole = roles.find((role) => role.id === 'alpha');
    const copilotRole = roles.find((role) => role.id === 'bravo');
    expect(codexRole?.source).toBe('codex');
    expect(copilotRole?.source).toBe('copilot');
  });

  it('AGG-05: resolves duplicate Copilot identifiers deterministically with a warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    writeAgentFile(
      tempDir,
      'a.agent.md',
      buildAgentContent(['name: duplicate', 'description: First'], 'First body'),
    );
    writeAgentFile(
      tempDir,
      'b.agent.md',
      buildAgentContent(['name: duplicate', 'description: Second'], 'Second body'),
    );
    const roles = roleSources.listRoles() as Array<Record<string, unknown>>;
    expect(roles.filter((role) => role.id === 'duplicate').length).toBe(1);
    const resolved = roleSources.resolveTemplate('duplicate') as Record<string, unknown> | null;
    expect(resolved?.prompt).toBe('First body');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
