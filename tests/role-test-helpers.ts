import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Resolve the temp `.codex` directory path.
 *
 * @param {string} rootDir - The temporary workspace root.
 * @returns {string} Absolute path to the `.codex` directory.
 * @remarks
 * Centralising the path avoids drift across test files.
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
 * Keeping this in one helper ensures consistent discovery paths.
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
 * The directory is created recursively to keep fixture setup deterministic.
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
 * The directory is created recursively so tests can add files in any order.
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
 * The file is written synchronously to avoid timing issues in tests.
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
 * This helper ensures agents land in the expected discovery path.
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
 * The helper keeps YAML formatting consistent for parsing tests.
 * @example
 * buildAgentContent(['description: Example'], 'Body');
 */
const buildAgentContent = (frontMatterLines: string[], body: string): string =>
  ['---', ...frontMatterLines, '---', '', body].join('\n');

/**
 * Create a temporary workspace directory for tests.
 *
 * @param {string} prefix - Prefix for the temporary directory name.
 * @returns {string} Absolute path to the newly created directory.
 * @remarks
 * This helper uses the OS temp directory to keep fixtures isolated.
 * @example
 * const dir = createTempWorkspace('codex-roles-');
 */
const createTempWorkspace = (prefix: string): string =>
  fs.mkdtempSync(path.join(os.tmpdir(), prefix));

/**
 * Remove a temporary workspace directory if it exists.
 *
 * @param {string} rootDir - The temporary workspace root.
 * @returns {void}
 * @remarks
 * Errors are swallowed so test teardown does not fail.
 * @example
 * cleanupTempWorkspace(tempDir);
 */
const cleanupTempWorkspace = (rootDir: string): void => {
  try {
    fs.rmSync(rootDir, { recursive: true, force: true });
  } catch {}
};

export {
  agentsDir,
  buildAgentContent,
  cleanupTempWorkspace,
  codexDir,
  createTempWorkspace,
  ensureAgentsDir,
  ensureCodexDir,
  writeAgentFile,
  writeCodexFile,
};
