import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT_PATH = path.resolve(
  process.cwd(),
  '.agents/skills/codex-delegate/scripts/run_delegate.sh',
);

const cleanupPaths: string[] = [];

/**
 * Create and track a temporary directory for test fixtures.
 *
 * @returns {string} Path to the created temporary directory.
 */
const makeTempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-skill-run-'));
  cleanupPaths.push(dir);
  return dir;
};

/**
 *
 * @param filePath
 * @param content
 */
const writeExecutable = (filePath: string, content: string): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  fs.chmodSync(filePath, 0o755);
};

/**
 * Execute the skill wrapper script with optional environment overrides.
 *
 * @param {string[]} args - CLI arguments to pass to the wrapper.
 * @param {NodeJS.ProcessEnv} envOverrides - Environment overrides for the spawned process.
 * @returns {ReturnType<typeof spawnSync>} Spawn result containing status and output.
 */
const runScript = (
  args: string[],
  envOverrides: NodeJS.ProcessEnv = {},
): SpawnSyncReturns<string> => {
  return spawnSync('/bin/bash', [SCRIPT_PATH, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...envOverrides },
  });
};

afterEach((): void => {
  for (const p of cleanupPaths) {
    try {
      fs.rmSync(p, { recursive: true, force: true });
    } catch {}
  }
  cleanupPaths.length = 0;
});

describe('skill wrapper run_delegate.sh', () => {
  it('RUN-DELEGATE-SCRIPT-01: prints usage when required args are missing', () => {
    const result = runScript([]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Usage:');
  });

  it('RUN-DELEGATE-SCRIPT-02: uses codex-delegate from PATH when available', () => {
    const root = makeTempDir();
    const binDir = path.join(root, 'bin');
    const fakeCodex = path.join(binDir, 'codex-delegate');
    writeExecutable(fakeCodex, ['#!/usr/bin/env bash', String.raw`printf "%s\n" "$@"`].join('\n'));

    const workingDir = path.join(root, 'workspace');
    fs.mkdirSync(workingDir, { recursive: true });
    const result = runScript(
      ['review', 'Check this change', workingDir, 'Use strict checks.', '15'],
      { PATH: `${binDir}:${process.env.PATH ?? ''}` },
    );

    expect(result.status).toBe(0);
    const args = result.stdout
      .trim()
      .split('\n')
      .filter((value) => value.length > 0);
    expect(args).toEqual([
      '--role',
      'review',
      '--task',
      'Check this change',
      '--working-dir',
      workingDir,
      '--timeout-minutes',
      '15',
      '--instructions',
      'Use strict checks.',
    ]);
  });

  it('RUN-DELEGATE-SCRIPT-03: falls back to local node script and default timeout', () => {
    const root = makeTempDir();
    const binDir = path.join(root, 'bin');
    const outputFile = path.join(root, 'argv.log');
    writeExecutable(binDir + '/node', `#!/bin/bash\n"${process.execPath}" "$@"`);

    const workingDir = path.join(root, 'workspace');
    const localCli = path.join(workingDir, 'bin', 'codex-delegate.js');
    writeExecutable(
      localCli,
      [
        '#!/usr/bin/env node',
        String.raw`require('node:fs').writeFileSync(${JSON.stringify(outputFile)}, process.argv.slice(2).join('\n'));`,
      ].join('\n'),
    );

    const result = runScript(['implementation', 'Add tests', workingDir], {
      PATH: `${binDir}`,
    });

    expect(result.status).toBe(0);
    const loggedArgs = fs.readFileSync(outputFile, 'utf8').trim().split('\n');
    expect(loggedArgs).toEqual([
      '--role',
      'implementation',
      '--task',
      'Add tests',
      '--working-dir',
      workingDir,
      '--timeout-minutes',
      '10',
    ]);
  });

  it('RUN-DELEGATE-SCRIPT-04: errors when no CLI is available', () => {
    const root = makeTempDir();
    const workingDir = path.join(root, 'workspace');
    fs.mkdirSync(workingDir, { recursive: true });

    const result = runScript(['testing', 'Run checks', workingDir], { PATH: '/usr/bin:/bin' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('codex-delegate not found on PATH');
  });
});
