import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildAgentContent,
  cleanupTempWorkspace,
  createTempWorkspace,
  writeAgentFile,
  writeCodexFile,
} from './role-test-helpers.js';

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

beforeEach(async () => {
  originalCwd = process.cwd();
  originalArgv = [...process.argv];
  tempDir = createTempWorkspace('codex-cli-');
  process.chdir(tempDir);
  vi.resetModules();
  helpers = await import('../src/codex-delegate');
});

afterEach(() => {
  process.argv = originalArgv;
  process.chdir(originalCwd);
  cleanupTempWorkspace(tempDir);
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
