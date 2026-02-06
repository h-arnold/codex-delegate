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
  listRoles: () => unknown[];
  resolveTemplate: (roleId: string) => unknown | null;
};

/**
 * Return an empty merged role list when the role source module is unavailable.
 *
 * @returns {unknown[]} Empty role array.
 * @remarks
 * This keeps the red-phase tests focused on missing behaviour rather than import errors.
 * @example
 * const roles = listRolesFallback();
 */
const listRolesFallback = (): unknown[] => [];

/**
 * Resolve a role template when the role source module is unavailable.
 *
 * @param {string} roleId - Role identifier to resolve.
 * @returns {unknown | null} Always returns `null` for the fallback.
 * @remarks
 * The fallback makes missing implementations fail assertions instead of imports.
 * @example
 * const role = resolveTemplateFallback('missing');
 */
const resolveTemplateFallback = (roleId: string): unknown | null => {
  void roleId;
  return null;
};

beforeEach(async () => {
  originalCwd = process.cwd();
  tempDir = createTempWorkspace('codex-roles-');
  process.chdir(tempDir);
  vi.resetModules();
  try {
    roleSources = (await import('../src/prompts/role-sources')) as unknown as {
      listRoles: () => unknown[];
      resolveTemplate: (roleId: string) => unknown | null;
    };
  } catch {
    roleSources = {
      listRoles: listRolesFallback,
      resolveTemplate: resolveTemplateFallback,
    };
  }
});

afterEach(() => {
  process.chdir(originalCwd);
  cleanupTempWorkspace(tempDir);
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
