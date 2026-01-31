import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/** Import helpers after mocking codex SDK as other tests do via module import */
vi.mock('@openai/codex-sdk', (): { Codex: new () => unknown } => ({
  Codex: class {
    /**
     * Return a mock `startThread` implementation.
     * @returns An object exposing a `runStreamed` method.
     */
    startThread(): {
      runStreamed: () => Promise<{ events: AsyncGenerator<never, void, unknown> }>;
    } {
      return {
        /**
         * Return a promise resolving to an async generator that yields nothing.
         * @returns Promise resolving to an object with `events` async generator.
         */
        runStreamed: async function (): Promise<{ events: AsyncGenerator<never, void, unknown> }> {
          return { events: (async function* (): AsyncGenerator<never, void, unknown> {})() };
        },
      };
    }
  },
}));

let helpers: typeof import('../src/codex-delegate');
let originalCwd = '';
let tempDir = '';

beforeEach(async () => {
  originalCwd = process.cwd();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-prompts-'));
  process.chdir(tempDir);
  helpers = await import('../src/codex-delegate');
});

afterEach(() => {
  process.chdir(originalCwd);
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}
});

describe('Prompt Templates', () => {
  /**
   * Resolve the `.codex` prompts directory for the current temp test workspace.
   *
   * @returns {string} Absolute path to the test `.codex` directory.
   * @example
   * const dir = promptsDir();
   */
  const promptsDir = (): string => path.join(tempDir, '.codex');
  const createdFiles = new Set<string>();
  let createdDir = false;

  /**
   * Ensure the `.codex` prompts directory exists for the test.
   *
   * @returns {void}
   * @remarks
   * Tracks whether the directory was created so cleanup can be conservative.
   * @example
   * ensurePromptsDir();
   */
  const ensurePromptsDir = (): void => {
    const targetDir = promptsDir();
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
      createdDir = true;
    }
  };

  /**
   * Write a prompt file into the `.codex` directory and track it for cleanup.
   *
   * @param {string} fileName - File name to create inside `.codex`.
   * @param {string} contents - File contents to write.
   * @returns {string} The full path to the created file.
   * @remarks
   * Ensures the `.codex` directory exists before writing.
   * @example
   * writePromptFile('implementation.md', 'Template');
   */
  const writePromptFile = (fileName: string, contents: string): string => {
    ensurePromptsDir();
    const filePath = path.join(promptsDir(), fileName);
    fs.writeFileSync(filePath, contents);
    createdFiles.add(filePath);
    return filePath;
  };

  /**
   * Remove tracked prompt files and the `.codex` directory if created and empty.
   *
   * @returns {void}
   * @remarks
   * Leaves any pre-existing `.codex` directory intact.
   * @example
   * cleanupPromptsDir();
   */
  const cleanupPromptsDir = (): void => {
    for (const filePath of createdFiles) {
      try {
        fs.rmSync(filePath, { force: true });
      } catch {}
    }
    createdFiles.clear();
    const targetDir = promptsDir();
    if (createdDir && fs.existsSync(targetDir) && fs.readdirSync(targetDir).length === 0) {
      try {
        fs.rmdirSync(targetDir);
      } catch {}
    }
    createdDir = false;
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanupPromptsDir();
  });

  it('ROLE-05: resolvePromptTemplate returns trimmed content for valid templates', () => {
    writePromptFile('__test_template.md', '  Hello world  \n');
    const out = helpers.resolvePromptTemplate('__test_template');
    expect(out).toBe('Hello world');
  });

  it('ROLE-06: resolvePromptTemplate returns empty string for missing or whitespace-only templates', () => {
    const missingOut = helpers.resolvePromptTemplate('this-file-should-not-exist');
    expect(missingOut).toBe('');
    writePromptFile('__test_whitespace.md', '   \n   ');
    const whitespaceOut = helpers.resolvePromptTemplate('__test_whitespace');
    expect(whitespaceOut).toBe('');
  });

  it('PROMPT-03: resolve template outside project path -> empty string', () => {
    // Spy on path.resolve to simulate resolving outside cwd
    const spy = vi.spyOn(path, 'resolve').mockReturnValue('/outside/project/.codex/foo.md');
    try {
      const out = helpers.resolvePromptTemplate('foo');
      expect(out).toBe('');
    } finally {
      spy.mockRestore();
    }
  });

  it('ROLE-01: listPromptRoles reads from .codex and returns sorted role names', () => {
    writePromptFile('__test_sort_b.md', 'B');
    writePromptFile('__test_sort_a.md', 'A');
    writePromptFile('__test_sort_c.md', 'C');
    const roles = helpers.listPromptRoles();
    // ensure our test roles are present and sorted
    const idxA = roles.indexOf('__test_sort_a');
    const idxB = roles.indexOf('__test_sort_b');
    const idxC = roles.indexOf('__test_sort_c');
    expect(idxA).toBeGreaterThanOrEqual(0);
    expect(idxB).toBeGreaterThanOrEqual(0);
    expect(idxC).toBeGreaterThanOrEqual(0);
    expect(idxA < idxB).toBe(true);
    expect(idxB < idxC).toBe(true);
  });

  it('PROMPT-05: listPromptRoles returns [] when directory missing', () => {
    // Simulate missing directory by resolving outside of project cwd
    const spy = vi.spyOn(path, 'resolve').mockReturnValue('/outside/project/.codex');
    try {
      const roles = helpers.listPromptRoles();
      expect(Array.isArray(roles)).toBe(true);
      expect(roles.length).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });

  it('PROMPT-06: buildPrompt composes template + instructions + task', () => {
    writePromptFile('__test_template.md', 'Template body');
    const out = helpers.buildPrompt({
      role: '__test_template',
      instructions: 'Do X',
      task: 'Finish',
    });
    expect(out).toContain('Template body');
    expect(out).toContain('Instructions:\nDo X');
    expect(out).toContain('Task:\nFinish');
    // sections should be separated by a blank line sequence
    expect(out.split('\n\n').length).toBeGreaterThanOrEqual(2);
  });

  it("PROMPT-07: '--list-roles' prints 'No roles available.' and exits when prompts missing/empty", () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as unknown as never);
    // Simulate missing prompts directory by resolving path outside project cwd
    const spy = vi.spyOn(path, 'resolve').mockReturnValue('/outside/project/.codex');
    try {
      helpers.handleImmediateFlag('--list-roles');
      expect(infoSpy).toHaveBeenCalledWith('No roles available.');
      expect(exitSpy).toHaveBeenCalledWith(0);
    } finally {
      spy.mockRestore();
      infoSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });

  it('ROLE-04: listPromptRoles ignores non-markdown files', () => {
    writePromptFile('__test_sort_b.md', 'B');
    writePromptFile('__test_sort_a.md', 'A');
    writePromptFile('__test_sort_c.txt', 'ignore me');
    const roles = helpers.listPromptRoles();
    expect(roles.includes('__test_sort_a')).toBe(true);
    expect(roles.includes('__test_sort_b')).toBe(true);
    expect(roles.includes('__test_sort_c')).toBe(false);
    const ai = roles.indexOf('__test_sort_a');
    const bi = roles.indexOf('__test_sort_b');
    expect(ai < bi).toBe(true);
  });

  it('ROLE-02: listPromptRoles ignores AGENTS.md even if present', () => {
    writePromptFile('AGENTS.md', 'Ignore this file');
    writePromptFile('__test_sort_a.md', 'A');
    const roles = helpers.listPromptRoles();
    expect(roles.includes('AGENTS')).toBe(false);
    expect(roles.includes('__test_sort_a')).toBe(true);
  });

  it('ROLE-03: listPromptRoles ignores whitespace-only markdown files', () => {
    writePromptFile('__test_whitespace.md', '   \n   ');
    writePromptFile('__test_sort_a.md', 'A');
    const roles = helpers.listPromptRoles();
    expect(roles.includes('__test_whitespace')).toBe(false);
    expect(roles.includes('__test_sort_a')).toBe(true);
  });
});
