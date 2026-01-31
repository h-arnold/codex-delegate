import path from 'node:path';

/**
 * Return the project's `src` directory path used for tests and template discovery.
 *
 * @returns {string} The resolved `src` directory path under the current working directory.
 */
export function getCurrentDirname(): string {
  // Return the project's `src` directory. This mirrors the original intent of
  // resolving helpers relative to the module's source files so `agent-prompts`
  // lives at <repo>/src/agent-prompts.
  return path.join(process.cwd(), 'src');
}
