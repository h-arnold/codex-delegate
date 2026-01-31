import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Read the tail (last N lines) of a log file safely, constrained to the project directory.
 *
 * @param {string} logPath - Path to the log file (must reside inside the project directory).
 * @param {number} lineCount - Number of trailing lines to return.
 * @returns {string[]} The last `lineCount` lines of the log, or an empty array if the file is missing or empty.
 * @remarks
 * This helper guards against reading files outside the project directory and returns an empty array on ENOENT.
 * @example
 * const tail = tailLogFile('codex-delegate.log', 5);
 */
function tailLogFile(logPath: string, lineCount: number): string[] {
  try {
    const resolved = path.resolve(logPath);
    if (!resolved.startsWith(process.cwd())) {
      return [];
    }
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- resolved path validated and constrained to project files
    const content = readFileSync(resolved, 'utf-8');
    const trimmed = content.trim();
    if (!trimmed) {
      return [];
    }
    const lines = trimmed.split('\n');
    return lines.slice(-lineCount);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export { tailLogFile };
