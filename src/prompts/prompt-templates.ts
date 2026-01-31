import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { getCurrentDirname } from '../common/file-utils.js';

const CURRENT_DIR = getCurrentDirname();

/**
 * Resolve and read a prompt template for a given role from the `agent-prompts` directory.
 *
 * @param {string} role - The prompt role name (file `<role>.md` in `agent-prompts`).
 * @returns {string} The template contents trimmed, or an empty string if the template is not found or is outside the project.
 * @remarks
 * This function guards against reading files outside of the project directory and returns an empty string when the role template is missing.
 * @example
 * resolvePromptTemplate('implementation');
 */
function resolvePromptTemplate(role: string): string {
  const fileName = `${role}.md`;
  const templatePath = path.join(CURRENT_DIR, 'agent-prompts', fileName);
  try {
    const resolved = path.resolve(templatePath);
    if (!resolved.startsWith(process.cwd())) {
      // If a template path somehow resolves outside the project, treat as missing
      return '';
    }
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- resolved path is validated and constrained to project files
    return readFileSync(resolved, 'utf-8').trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

/**
 * List available prompt role names by scanning the `agent-prompts` directory.
 *
 * @returns {string[]} A sorted array of role names (file basenames without `.md`), or an empty array if none are found.
 * @remarks
 * This function constrains reads to the project directory and will return an empty array if the prompts directory is missing.
 * @example
 * listPromptRoles();
 */
function listPromptRoles(): string[] {
  const promptsPath = path.join(CURRENT_DIR, 'agent-prompts');
  try {
    const resolved = path.resolve(promptsPath);
    if (!resolved.startsWith(process.cwd())) {
      return [];
    }
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is resolved and constrained to project files
    return readdirSync(resolved)
      .filter((entry) => entry.endsWith('.md'))
      .map((entry) => entry.replace(/\.md$/, ''))
      .sort((a, b) => a.localeCompare(b));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export { CURRENT_DIR, listPromptRoles, resolvePromptTemplate };
