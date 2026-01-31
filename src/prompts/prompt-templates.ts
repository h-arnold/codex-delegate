import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { getCodexConfigDir } from '../config/codex-config.js';
const AGENTS_FILE_NAME = 'AGENTS.md';

/**
 * Check whether a filename is a valid prompt template file.
 *
 * @param {string} entry - Directory entry name to inspect.
 * @returns {boolean} `true` if the entry is a markdown template to consider.
 * @remarks
 * This excludes `AGENTS.md` and any non-markdown files.
 * @example
 * isPromptTemplateFile('implementation.md');
 */
function isPromptTemplateFile(entry: string): boolean {
  return entry.endsWith('.md') && entry !== AGENTS_FILE_NAME;
}

/**
 * Read and trim a prompt template file, returning an empty string for blank content.
 *
 * @param {string} filePath - Full path to the template file.
 * @returns {string} Trimmed template contents or an empty string.
 * @remarks
 * Whitespace-only templates are treated as missing.
 * @example
 * const contents = readTemplateContents('/repo/.codex/review.md');
 */
function readTemplateContents(filePath: string): string {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- file path is resolved and constrained before use
  const contents = readFileSync(filePath, 'utf-8').trim();
  if (contents.length === 0) {
    return '';
  }
  return contents;
}

/**
 * Resolve and read a prompt template for a given role from the `.codex` directory.
 *
 * @param {string} role - The prompt role name (file `<role>.md` in `.codex`).
 * @returns {string} The template contents trimmed, or an empty string if the template is not found or is outside the project.
 * @remarks
 * This function guards against reading files outside of the project directory and returns an empty string when the role template is missing.
 * @example
 * resolvePromptTemplate('implementation');
 */
function resolvePromptTemplate(role: string): string {
  const fileName = `${role}.md`;
  if (fileName === AGENTS_FILE_NAME) {
    return '';
  }
  const templatePath = path.join(getCodexConfigDir(), fileName);
  try {
    const resolved = path.resolve(templatePath);
    if (!resolved.startsWith(process.cwd())) {
      // If a template path somehow resolves outside the project, treat as missing
      return '';
    }

    return readTemplateContents(resolved);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

/**
 * List available prompt role names by scanning the `.codex` directory.
 *
 * @returns {string[]} A sorted array of role names (file basenames without `.md`), or an empty array if none are found.
 * @remarks
 * This function constrains reads to the project directory and will return an empty array if the prompts directory is missing.
 * @example
 * listPromptRoles();
 */
function listPromptRoles(): string[] {
  const promptsPath = getCodexConfigDir();
  try {
    const resolved = path.resolve(promptsPath);
    if (!resolved.startsWith(process.cwd())) {
      return [];
    }
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is resolved and constrained to project files
    return readdirSync(resolved)
      .filter((entry) => isPromptTemplateFile(entry))
      .filter((entry) => {
        const resolvedEntry = path.resolve(path.join(resolved, entry));
        if (!resolvedEntry.startsWith(resolved)) {
          return false;
        }
        try {
          return readTemplateContents(resolvedEntry).length > 0;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return false;
          }
          throw error;
        }
      })
      .map((entry) => entry.replace(/\.md$/, ''))
      .sort((a, b) => a.localeCompare(b));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export { listPromptRoles, resolvePromptTemplate };
