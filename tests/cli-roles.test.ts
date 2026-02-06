import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Mock the codex SDK before importing the module to avoid network code */
vi.mock('@openai/codex-sdk', (): { Codex: new () => unknown } => ({
  Codex: class {
    /**
     * Return a mock thread with a `runStreamed` method that emits no events.
     * @returns An object with a `runStreamed` method returning a promise that resolves to a no-op events generator.
     * @remarks
     * The mock keeps CLI tests fast by preventing any external calls.
     */
    startThread(): {
      runStreamed: () => Promise<{ events: AsyncGenerator<never, void, unknown> }>;
    } {
      return {
        /**
         * Return a promise resolving to an events async generator (yields no events).
         * @returns A promise resolving to an object with an `events` async generator.
         * @remarks
         * The generator yields no events to keep test runs deterministic.
         */
        runStreamed: async function (): Promise<{ events: AsyncGenerator<never, void, unknown> }> {
          return { events: (async function* (): AsyncGenerator<never, void, unknown> {})() };
        },
      };
    }
  },
}));

let originalCwd = '';
let tempDir = '';
let originalArgv: string[] = [];
let helpers: typeof import('../src/codex-delegate');

/**
 * Resolve the temp `.codex` directory path.
 *
 * @param {string} rootDir - The temporary workspace root.
 * @returns {string} Absolute path to the `.codex` directory.
 * @remarks
 * This keeps the prompt directory path consistent across CLI tests.
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
 * This helper isolates Copilot agent fixtures within the temp workspace.
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
 * The directory is created recursively to keep setup predictable.
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
 * The directory is created recursively so tests can create fixtures in any order.
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
 * The file is written synchronously so discovery has a stable fixture set.
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
 * This helper ensures agents are created in the expected discovery path.
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
 * The format mirrors Copilot agent files so the parser exercises real inputs.
 * @example
 * buildAgentContent(['description: Example'], 'Body');
 */
const buildAgentContent = (frontMatterLines: string[], body: string): string =>
  ['---', ...frontMatterLines, '---', '', body].join('\n');

beforeEach(async () => {
  originalCwd = process.cwd();
  originalArgv = [...process.argv];
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-cli-'));
  process.chdir(tempDir);
  vi.resetModules();
  helpers = await import('../src/codex-delegate');
});

afterEach(() => {
  process.argv = originalArgv;
  process.chdir(originalCwd);
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}
});

describe('CLI Roles', () => {
  it('CLI-01: --list-roles outputs merged roles', () => {
    writeCodexFile(tempDir, 'alpha.md', 'Alpha body');
    writeAgentFile(
      tempDir,
      'bravo.agent.md',
      buildAgentContent(['description: Bravo role'], 'Bravo body'),
    );
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as unknown as never);
    helpers.handleImmediateFlag('--list-roles');
    const output = infoSpy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(output).toContain('Available roles:');
    expect(output).toMatch(/alpha/);
    expect(output).toMatch(/bravo/);
    expect(exitSpy).toHaveBeenCalledWith(0);
    infoSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('CLI-02: role validation uses merged list and lists merged roles in errors', async () => {
    writeCodexFile(tempDir, 'alpha.md', 'Alpha body');
    writeAgentFile(
      tempDir,
      'bravo.agent.md',
      buildAgentContent(['description: Bravo role'], 'Bravo body'),
    );
    process.argv = [
      originalArgv[0] ?? 'node',
      originalArgv[1] ?? 'script',
      '--role',
      'missing',
      '--task',
      'Test task',
    ];
    await expect(helpers.run()).rejects.toThrow(
      /Available roles:[\s\S]*alpha[\s\S]*bravo|Available roles:[\s\S]*bravo[\s\S]*alpha/,
    );
  });

  it('CLI-03: with no roles in either source, --list-roles prints "No roles available."', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as unknown as never);
    helpers.handleImmediateFlag('--list-roles');
    expect(infoSpy).toHaveBeenCalledWith('No roles available.');
    expect(exitSpy).toHaveBeenCalledWith(0);
    infoSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
