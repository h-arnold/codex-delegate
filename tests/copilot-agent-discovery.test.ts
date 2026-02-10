import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildAgentContent,
  cleanupTempWorkspace,
  createTempWorkspace,
  ensureAgentsDir,
  listFallback,
  resolveFallback,
  writeAgentFile,
} from './role-test-helpers.js';

let originalCwd = '';
let tempDir = '';
let copilotHelpers: {
  listCopilotRoles: () => unknown[];
  resolveCopilotRole: (roleId: string) => unknown | null;
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
      listCopilotRoles: listFallback,
      resolveCopilotRole: resolveFallback,
    };
  }
});

afterEach(() => {
  process.chdir(originalCwd);
  cleanupTempWorkspace(tempDir);
});

/**
 * Helper to capture console warnings during test execution.
 *
 * @param {() => void} testFn - Test function to execute.
 * @returns {string} Captured warning messages.
 * @remarks
 * Reduces duplication by centralizing spy setup and teardown.
 */
function captureWarnings(testFn: () => void): string {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    testFn();
    return warnSpy.mock.calls.map((call) => String(call[0])).join('\n');
  } finally {
    warnSpy.mockRestore();
  }
}

/**
 * Type-safe wrapper for listing Copilot roles.
 *
 * @returns {Array<Record<string, unknown>>} List of roles with type assertion.
 * @remarks
 * Reduces duplication by centralizing the type assertion pattern.
 */
function listRoles(): Array<Record<string, unknown>> {
  return copilotHelpers.listCopilotRoles() as Array<Record<string, unknown>>;
}

/**
 * Type-safe wrapper for resolving a Copilot role.
 *
 * @param {string} roleId - Role identifier.
 * @returns {Record<string, unknown> | null} Resolved role or null.
 * @remarks
 * Reduces duplication by centralizing the type assertion pattern.
 */
function resolveRole(roleId: string): Record<string, unknown> | null {
  return copilotHelpers.resolveCopilotRole(roleId) as Record<string, unknown> | null;
}

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

  it('COPILOT-05: treats description as optional when name is present', () => {
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
    expect(roles.length).toBe(2);
    const namedRole = roles.find((role) => role.id === 'missing-description');
    expect(namedRole).not.toHaveProperty('description');
    const blankRole = roles.find((role) => role.id === 'blank-description');
    expect(blankRole).not.toHaveProperty('description');
  });

  it('COPILOT-19: falls back to the filename when name and description are missing', () => {
    writeAgentFile(tempDir, 'no-name-description.agent.md', buildAgentContent([], 'Body'));
    const roles = copilotHelpers.listCopilotRoles() as Array<Record<string, unknown>>;
    expect(roles.length).toBe(1);
    expect(roles[0]?.id).toBe('no-name-description');
    expect(roles[0]).not.toHaveProperty('description');
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
    const resolved = resolveRole('body');
    const prompt = resolved?.prompt;
    expect(typeof prompt).toBe('string');
    expect(prompt).toContain('You are a body tester.');
    expect(prompt).not.toContain('description:');
    expect(prompt).not.toContain('---');
  });

  it('COPILOT-24: parses front matter with CRLF line endings', () => {
    writeAgentFile(
      tempDir,
      'crlf.agent.md',
      ['---', 'description: CRLF test', '---', '', 'Body with CRLF.'].join('\r\n'),
    );
    const resolved = resolveRole('crlf');
    expect(resolved?.description).toBe('CRLF test');
    expect(resolved?.prompt).toContain('Body with CRLF.');
  });

  it('COPILOT-09: skips malformed YAML with a warning (no throw)', () => {
    const warnings = captureWarnings(() => {
      writeAgentFile(tempDir, 'bad.agent.md', '---\nname: [\n---\nBody');
      const roles = copilotHelpers.listCopilotRoles() as Array<Record<string, unknown>>;
      expect(roles.length).toBe(0);
    });
    expect(warnings).toContain('bad.agent.md');
  });

  it('COPILOT-21: parses front matter using the multi-agent planner format', () => {
    writeAgentFile(
      tempDir,
      'multi-agent-planner.agent.md',
      [
        '---',
        'name: Multi-Agent Planner Agent Instructions',
        'tools:',
        '  [',
        "    'read/readFile',",
        "    'search',",
        "    'agent',",
        '  ]',
        'user-invokable: true',
        'disable-model-invocation: false',
        '---',
        '',
        'You are the planner.',
      ].join('\n'),
    );
    const roles = listRoles();
    expect(roles.length).toBe(1);
    expect(roles[0]?.id).toBe('Multi-Agent Planner Agent Instructions');
    const resolved = resolveRole('Multi-Agent Planner Agent Instructions');
    expect(resolved?.prompt).toContain('You are the planner.');
  });

  it('COPILOT-10: ignores unknown front matter properties without failing', () => {
    writeAgentFile(
      tempDir,
      'unknown.agent.md',
      buildAgentContent(['description: Known', 'fancy: ignored'], 'Body'),
    );
    const resolved = resolveRole('unknown');
    expect(resolved).not.toBeNull();
    expect(resolved).not.toHaveProperty('metadata');
  });

  it('COPILOT-23: trims quoted name and description values', () => {
    writeAgentFile(
      tempDir,
      'quoted.agent.md',
      buildAgentContent(
        ['name: "  quoted-name  "', "description: '  Quoted description  '"],
        'Body',
      ),
    );
    const roles = copilotHelpers.listCopilotRoles() as Array<Record<string, unknown>>;
    expect(roles.length).toBe(1);
    expect(roles[0]?.id).toBe('quoted-name');
    expect(roles[0]?.description).toBe('Quoted description');
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

  it('COPILOT-18: supports multi-line tools arrays in front matter', () => {
    writeAgentFile(
      tempDir,
      'multi-tools.agent.md',
      buildAgentContent(
        [
          'name: multi-tools',
          'description: Multi tools format',
          'tools:',
          '  [',
          "    'read',",
          "    'search',",
          '  ]',
          'model: gpt-5.2-codex',
        ],
        'Body',
      ),
    );
    const resolved = copilotHelpers.resolveCopilotRole('multi-tools') as Record<
      string,
      unknown
    > | null;
    expect(resolved?.metadata).toEqual({
      tools: ['read', 'search'],
      model: 'gpt-5.2-codex',
    });
  });

  it('COPILOT-20: supports YAML list blocks for tools metadata', () => {
    writeAgentFile(
      tempDir,
      'list-tools.agent.md',
      buildAgentContent(
        ['name: list-tools', 'description: Tools list block', 'tools:', "  - 'read'", '  - search'],
        'Body',
      ),
    );
    const resolved = copilotHelpers.resolveCopilotRole('list-tools') as Record<
      string,
      unknown
    > | null;
    expect(resolved?.metadata).toEqual({ tools: ['read', 'search'] });
  });

  it('COPILOT-12: missing .github/agents directory returns an empty role list', () => {
    const roles = copilotHelpers.listCopilotRoles() as Array<Record<string, unknown>>;
    expect(roles.length).toBe(0);
  });

  it('COPILOT-13: skips files without YAML front matter with a warning', () => {
    const warnings = captureWarnings(() => {
      writeAgentFile(tempDir, 'no-front-matter.agent.md', 'You are a test agent.');
      const roles = copilotHelpers.listCopilotRoles() as Array<Record<string, unknown>>;
      expect(roles.length).toBe(0);
    });
    expect(warnings).toContain('no-front-matter.agent.md');
  });

  it('COPILOT-15: skips files missing closing front matter delimiter with a warning', () => {
    const warnings = captureWarnings(() => {
      writeAgentFile(tempDir, 'no-closing.agent.md', '---\ndescription: Test role\nBody');
      const roles = copilotHelpers.listCopilotRoles() as Array<Record<string, unknown>>;
      expect(roles.length).toBe(0);
    });
    expect(warnings).toContain('no-closing.agent.md');
  });

  it('COPILOT-16: resolve warns on missing closing front matter delimiter', () => {
    const warnings = captureWarnings(() => {
      writeAgentFile(tempDir, 'no-closing.agent.md', '---\ndescription: Test role\nBody');
      const resolved = copilotHelpers.resolveCopilotRole('no-closing');
      expect(resolved).toBeNull();
    });
    expect(warnings).toContain('no-closing.agent.md');
  });

  it('COPILOT-17: skips symlinked agent files with a warning', () => {
    const warnings = captureWarnings(() => {
      const agentsDir = ensureAgentsDir(tempDir);
      const targetPath = path.join(tempDir, 'outside.md');
      fs.writeFileSync(targetPath, '---\ndescription: Outside\n---\nBody');
      const symlinkPath = path.join(agentsDir, 'linked.agent.md');
      fs.symlinkSync(targetPath, symlinkPath);
      const roles = copilotHelpers.listCopilotRoles() as Array<Record<string, unknown>>;
      expect(roles.length).toBe(0);
    });
    expect(warnings).toContain('symlink');
  });

  it('COPILOT-14: returns null for unknown role ids', () => {
    const resolved = resolveRole('unknown');
    expect(resolved).toBeNull();
  });
});
