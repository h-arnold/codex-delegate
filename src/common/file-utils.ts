import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Return the project's `src` directory path used for tests and template discovery.
 *
 * @returns {string} The resolved `src` directory path under the current working directory.
 * @remarks
 * Prefers the directory containing this module to avoid dependency on `process.cwd()`.
 * Falls back to the current working directory if the module URL cannot be resolved.
 * @example
 * const dir = getCurrentDirname();
 */
export function getCurrentDirname(): string {
  try {
    const modulePath = fileURLToPath(import.meta.url);
    return path.resolve(path.dirname(modulePath), '..');
  } catch {
    // Return the project's `src` directory. This mirrors the original intent of
    // resolving helpers relative to the module's source files so `agent-prompts`
    // lives at <repo>/src/agent-prompts.
    return path.join(process.cwd(), 'src');
  }
}
