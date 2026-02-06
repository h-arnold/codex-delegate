import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildAgentContent,
  cleanupTempWorkspace,
  createTempWorkspace,
  writeAgentFile,
} from './role-test-helpers.js';

let originalCwd = '';
let tempDir = '';
let copilotHelpers: {
  listCopilotRoles: () => unknown[];
  resolveCopilotRole: (roleId: string) => unknown | null;
};

/**
 * Return an empty Copilot role list when the module is unavailable.
 *
 * @returns {unknown[]} Empty role array.
 * @remarks
 * This keeps red-phase tests failing on assertions rather than module resolution.
 * @example
 * const roles = listCopilotFallback();
 */
const listCopilotFallback = (): unknown[] => [];

/**
 * Resolve a Copilot role when the module is unavailable.
 *
 * @param {string} roleId - Role identifier to resolve.
 * @returns {unknown | null} Always returns `null` for the fallback.
 * @remarks
 * Keeping the fallback explicit avoids false positives when the module is missing.
 * @example
 * const role = resolveCopilotFallback('missing');
 */
const resolveCopilotFallback = (roleId: string): unknown | null => {
  void roleId;
  return null;
};

beforeEach(async () => {
  originalCwd = process.cwd();
  tempDir = createTempWorkspace('codex-copilot-');
  process.chdir(tempDir);
  vi.resetModules();
  try {
    copilotHelpers = (await import('../src/prompts/copilot-agents')) as unknown as {
      listCopilotRoles: () => unknown[];
      resolveCopilotRole: (roleId: string) => unknown | null;
    };
  } catch {
    copilotHelpers = {
      listCopilotRoles: listCopilotFallback,
      resolveCopilotRole: resolveCopilotFallback,
    };
  }
});

afterEach(() => {
  process.chdir(originalCwd);
  cleanupTempWorkspace(tempDir);
});

describe('Copilot Agent Discovery', () => {
  it('COPILOT-01: discovers valid .github/agents/*.agent.md files', () => {
    writeAgentFile(
      tempDir,
      'tester.agent.md',
      buildAgentContent(['description: Testing specialist'], 'You are a tester.'),
    );
    const roles = copilotHelpers.listCopilotRoles() as Array<Record<string, unknown>>;
    expect(roles.length).toBe(1);
    expect(roles[0]?.id).toBe('tester');
  });

  it('COPILOT-02: ignores non-.agent.md files in .github/agents', () => {
    writeAgentFile(tempDir, 'valid.agent.md', buildAgentContent(['description: Valid'], 'Body'));
    writeAgentFile(tempDir, 'ignored.md', 'Not an agent file');
    const roles = copilotHelpers.listCopilotRoles() as Array<Record<string, unknown>>;
    expect(roles.map((role) => role.id)).toEqual(['valid']);
  });

  it('COPILOT-03: skips empty or whitespace-only files', () => {
    writeAgentFile(tempDir, 'blank.agent.md', '   \n  ');
    const roles = copilotHelpers.listCopilotRoles() as Array<Record<string, unknown>>;
    expect(roles.length).toBe(0);
  });

  it('COPILOT-04: parses YAML front matter and extracts name and description', () => {
    writeAgentFile(
      tempDir,
      'quality.agent.md',
      buildAgentContent(['name: quality-engineer', 'description: Focuses on quality'], 'Body'),
    );
    const roles = copilotHelpers.listCopilotRoles() as Array<Record<string, unknown>>;
    expect(roles.length).toBe(1);
    expect(roles[0]?.id).toBe('quality-engineer');
    expect(roles[0]?.description).toBe('Focuses on quality');
  });

  it('COPILOT-05: skips files missing or blank description', () => {
    writeAgentFile(
      tempDir,
      'no-description.agent.md',
      buildAgentContent(['name: missing-description'], 'Body'),
    );
    writeAgentFile(
      tempDir,
      'blank-description.agent.md',
      buildAgentContent(['description: "   "'], 'Body'),
    );
    const roles = copilotHelpers.listCopilotRoles() as Array<Record<string, unknown>>;
    expect(roles.length).toBe(0);
  });

  it('COPILOT-06: uses name as role id when present', () => {
    writeAgentFile(
      tempDir,
      'fallback.agent.md',
      buildAgentContent(['name: ops-helper', 'description: Ops helper'], 'Body'),
    );
    const roles = copilotHelpers.listCopilotRoles() as Array<Record<string, unknown>>;
    expect(roles[0]?.id).toBe('ops-helper');
  });

  it('COPILOT-07: falls back to filename when name is missing', () => {
    writeAgentFile(
      tempDir,
      'fallback.agent.md',
      buildAgentContent(['description: Fallback'], 'Body'),
    );
    const roles = copilotHelpers.listCopilotRoles() as Array<Record<string, unknown>>;
    expect(roles[0]?.id).toBe('fallback');
  });

  it('COPILOT-08: extracts prompt body and excludes front matter', () => {
    writeAgentFile(
      tempDir,
      'body.agent.md',
      buildAgentContent(['description: Body role'], 'You are a body tester.'),
    );
    const resolved = copilotHelpers.resolveCopilotRole('body') as Record<string, unknown> | null;
    const prompt = resolved?.prompt;
    expect(typeof prompt).toBe('string');
    expect(prompt).toContain('You are a body tester.');
    expect(prompt).not.toContain('description:');
    expect(prompt).not.toContain('---');
  });

  it('COPILOT-09: skips malformed YAML with a warning (no throw)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      writeAgentFile(tempDir, 'bad.agent.md', '---\nname: [\n---\nBody');
      const roles = copilotHelpers.listCopilotRoles() as Array<Record<string, unknown>>;
      const warnings = warnSpy.mock.calls.map((call) => String(call[0])).join('\n');
      expect(roles.length).toBe(0);
      expect(warnSpy).toHaveBeenCalled();
      expect(warnings).toContain('bad.agent.md');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('COPILOT-10: ignores unknown front matter properties without failing', () => {
    writeAgentFile(
      tempDir,
      'unknown.agent.md',
      buildAgentContent(['description: Known', 'fancy: ignored'], 'Body'),
    );
    const resolved = copilotHelpers.resolveCopilotRole('unknown') as Record<string, unknown> | null;
    expect(resolved).not.toBeNull();
    expect(resolved?.metadata).not.toHaveProperty('fancy');
  });

  it('COPILOT-11: preserves optional metadata when present', () => {
    writeAgentFile(
      tempDir,
      'meta.agent.md',
      buildAgentContent(
        [
          'name: ops-helper',
          'description: Ops helper',
          "tools: ['read', 'search']",
          'model: gpt-5.2-codex',
          'target: github-copilot',
          "mcp-servers: ['atlas']",
        ],
        'Body',
      ),
    );
    const resolved = copilotHelpers.resolveCopilotRole('ops-helper') as Record<
      string,
      unknown
    > | null;
    expect(resolved?.metadata).toEqual({
      tools: ['read', 'search'],
      model: 'gpt-5.2-codex',
      target: 'github-copilot',
      'mcp-servers': ['atlas'],
    });
  });

  it('COPILOT-12: missing .github/agents directory returns an empty role list', () => {
    const roles = copilotHelpers.listCopilotRoles() as Array<Record<string, unknown>>;
    expect(roles.length).toBe(0);
  });

  it('COPILOT-13: skips files without YAML front matter with a warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      writeAgentFile(tempDir, 'no-front-matter.agent.md', 'You are a test agent.');
      const roles = copilotHelpers.listCopilotRoles() as Array<Record<string, unknown>>;
      const warnings = warnSpy.mock.calls.map((call) => String(call[0])).join('\n');
      expect(roles.length).toBe(0);
      expect(warnSpy).toHaveBeenCalled();
      expect(warnings).toContain('no-front-matter.agent.md');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('COPILOT-14: returns null for unknown role ids', () => {
    const resolved = copilotHelpers.resolveCopilotRole('unknown') as Record<string, unknown> | null;
    expect(resolved).toBeNull();
  });
});
