import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildAgentContent,
  cleanupTempWorkspace,
  createTempWorkspace,
  writeAgentFile,
  writeCodexFile,
} from './role-test-helpers.js';

let originalCwd = '';
let tempDir = '';
let roleSources: {
  resolveTemplate: (roleId: string) => unknown | null;
};

/**
 * Resolve a role template when the role source module is unavailable.
 *
 * @param {string} roleId - Role identifier to resolve.
 * @returns {unknown | null} Always returns `null` for the fallback.
 * @remarks
 * The fallback ensures red-phase assertions fail instead of import resolution.
 * @example
 * const role = resolveTemplateFallback('missing');
 */
const resolveTemplateFallback = (roleId: string): unknown | null => {
  void roleId;
  return null;
};

beforeEach(async () => {
  originalCwd = process.cwd();
  tempDir = createTempWorkspace('codex-resolve-');
  process.chdir(tempDir);
  vi.resetModules();
  try {
    roleSources = (await import('../src/prompts/role-sources')) as unknown as {
      resolveTemplate: (roleId: string) => unknown | null;
    };
  } catch {
    roleSources = {
      resolveTemplate: resolveTemplateFallback,
    };
  }
});

afterEach(() => {
  process.chdir(originalCwd);
  cleanupTempWorkspace(tempDir);
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
