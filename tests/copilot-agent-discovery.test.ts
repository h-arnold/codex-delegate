import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let originalCwd = '';
let tempDir = '';
let copilotHelpers: {
  listCopilotRoles: () => unknown[];
  resolveCopilotRole: (roleId: string) => unknown | null;
};

/**
 * Resolve the temp `.github/agents` directory path.
 *
 * @param {string} rootDir - The temporary workspace root.
 * @returns {string} Absolute path to the agents directory.
 * @remarks
 * This helper keeps the test path logic consistent and local to the temp workspace.
 * @example
 * const dir = agentsDir(tempDir);
 */
const agentsDir = (rootDir: string): string => path.join(rootDir, '.github', 'agents');

/**
 * Ensure the `.github/agents` directory exists.
 *
 * @param {string} rootDir - The temporary workspace root.
 * @returns {string} Absolute path to the agents directory.
 * @remarks
 * The directory is created recursively to avoid test order dependencies.
 * @example
 * ensureAgentsDir(tempDir);
 */
const ensureAgentsDir = (rootDir: string): string => {
  const dir = agentsDir(rootDir);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

/**
 * Write an agent markdown file into `.github/agents`.
 *
 * @param {string} rootDir - The temporary workspace root.
 * @param {string} fileName - File name including `.agent.md`.
 * @param {string} contents - File contents to write.
 * @returns {string} Absolute path to the created file.
 * @remarks
 * The file is written synchronously to keep test setup deterministic.
 * @example
 * writeAgentFile(tempDir, 'tester.agent.md', '---\\ndescription: Test\\n---\\nBody');
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
 * The helper keeps the front matter delimiter format consistent for parsing tests.
 * @example
 * buildAgentContent(['description: Example'], 'Body');
 */
const buildAgentContent = (frontMatterLines: string[], body: string): string =>
  ['---', ...frontMatterLines, '---', '', body].join('\n');

beforeEach(async () => {
  originalCwd = process.cwd();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-copilot-'));
  process.chdir(tempDir);
  vi.resetModules();
  copilotHelpers = (await import('../src/prompts/copilot-agents')) as unknown as {
    listCopilotRoles: () => unknown[];
    resolveCopilotRole: (roleId: string) => unknown | null;
  };
});

afterEach(() => {
  process.chdir(originalCwd);
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}
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
