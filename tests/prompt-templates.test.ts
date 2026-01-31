import fs from 'node:fs';
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
beforeEach(async () => {
  helpers = await import('../src/codex-delegate');
});

describe('Prompt Templates', () => {
  const promptsDir = path.join(process.cwd(), 'src', 'agent-prompts');

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    // clean up any test files we might have created
    try {
      fs.unlinkSync(path.join(promptsDir, '__test_whitespace.md'));
    } catch {}
    try {
      fs.unlinkSync(path.join(promptsDir, '__test_sort_a.md'));
    } catch {}
    try {
      fs.unlinkSync(path.join(promptsDir, '__test_sort_b.md'));
    } catch {}
    try {
      fs.unlinkSync(path.join(promptsDir, '__test_sort_c.md'));
    } catch {}
    try {
      fs.unlinkSync(path.join(promptsDir, '__test_sort_c.txt'));
    } catch {}
    try {
      fs.unlinkSync(path.join(promptsDir, '__test_template.md'));
    } catch {}
  });

  it('PROMPT-01: resolve existing template returns trimmed contents', () => {
    const p = path.join(promptsDir, '__test_template.md');
    fs.writeFileSync(p, '  Hello world  \n');
    const out = helpers.resolvePromptTemplate('__test_template');
    expect(out).toBe('Hello world');
  });

  it('PROMPT-02: resolve missing template returns empty string (ENOENT)', () => {
    const out = helpers.resolvePromptTemplate('this-file-should-not-exist');
    expect(out).toBe('');
  });

  it('PROMPT-03: resolve template outside project path -> empty string', () => {
    // Spy on path.resolve to simulate resolving outside cwd
    const spy = vi.spyOn(path, 'resolve').mockReturnValue('/outside/project/agent-prompts/foo.md');
    try {
      const out = helpers.resolvePromptTemplate('foo');
      expect(out).toBe('');
    } finally {
      spy.mockRestore();
    }
  });

  it('PROMPT-04: listPromptRoles returns sorted base names', () => {
    const a = path.join(promptsDir, '__test_sort_a.md');
    const b = path.join(promptsDir, '__test_sort_b.md');
    const c = path.join(promptsDir, '__test_sort_c.md');
    fs.writeFileSync(b, 'B');
    fs.writeFileSync(a, 'A');
    fs.writeFileSync(c, 'C');
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
    const spy = vi.spyOn(path, 'resolve').mockReturnValue('/outside/project/agent-prompts');
    try {
      const roles = helpers.listPromptRoles();
      expect(Array.isArray(roles)).toBe(true);
      expect(roles.length).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });

  it('PROMPT-06: buildPrompt composes template + instructions + task', () => {
    const p = path.join(promptsDir, '__test_template.md');
    fs.writeFileSync(p, 'Template body');
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
    const spy = vi.spyOn(path, 'resolve').mockReturnValue('/outside/project/agent-prompts');
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

  it('PROMPT-08: listPromptRoles ignores non-.md files and sorts correctly', () => {
    const a = path.join(promptsDir, '__test_sort_a.md');
    const b = path.join(promptsDir, '__test_sort_b.md');
    const t = path.join(promptsDir, '__test_sort_c.txt');
    fs.writeFileSync(b, 'B');
    fs.writeFileSync(a, 'A');
    fs.writeFileSync(t, 'ignore me');
    const roles = helpers.listPromptRoles();
    expect(roles.includes('__test_sort_a')).toBe(true);
    expect(roles.includes('__test_sort_b')).toBe(true);
    expect(roles.includes('__test_sort_c')).toBe(false);
    const ai = roles.indexOf('__test_sort_a');
    const bi = roles.indexOf('__test_sort_b');
    expect(ai < bi).toBe(true);
  });

  it('PROMPT-09: resolvePromptTemplate returns empty string for files with only whitespace', () => {
    const p = path.join(promptsDir, '__test_whitespace.md');
    fs.writeFileSync(p, '   \n   ');
    const out = helpers.resolvePromptTemplate('__test_whitespace');
    expect(out).toBe('');
  });
});
