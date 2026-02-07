import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';

type CopilotMetadata = {
  tools?: string[];
  model?: string;
  target?: string;
  'mcp-servers'?: string[];
};

type CopilotRoleSummary = {
  id: string;
  description: string;
  source: 'copilot';
};

type CopilotRoleTemplate = {
  id: string;
  description: string;
  prompt: string;
  source: 'copilot';
  metadata?: CopilotMetadata;
};

const AGENTS_DIRECTORY = path.join('.github', 'agents');
const AGENT_SUFFIX = '.agent.md';
const FRONT_MATTER_DELIMITER = '---';
const FRONT_MATTER_END_OFFSET = 2;

/**
 * Check whether a filename is a Copilot agent markdown file.
 *
 * @param {string} entry - Directory entry to inspect.
 * @returns {boolean} `true` when the file has the `.agent.md` suffix.
 * @remarks
 * Only files with the `.agent.md` suffix are considered for Copilot agent discovery.
 * @example
 * isAgentFile('tester.agent.md');
 */
function isAgentFile(entry: string): boolean {
  return entry.endsWith(AGENT_SUFFIX);
}

/**
 * Parse a YAML scalar or inline list into a JavaScript value.
 *
 * @param {string} rawValue - Raw YAML value string.
 * @returns {string | string[]} Parsed value, supporting simple strings and inline string arrays.
 * @throws {Error} When the value looks like an array but is malformed.
 * @remarks
 * This parser supports the subset of YAML used by Copilot agent front matter.
 * @example
 * parseYamlValue("['read', 'search']");
 */
function parseYamlValue(rawValue: string): string | string[] {
  const trimmed = rawValue.trim();
  if (trimmed.length === 0) {
    return '';
  }

  if (trimmed.startsWith('[')) {
    if (!trimmed.endsWith(']')) {
      throw new Error('Malformed YAML array value.');
    }
    const inner = trimmed.slice(1, -1).trim();
    if (inner.length === 0) {
      return [];
    }
    return inner
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .map((value) => value.replace(/^['"]|['"]$/g, ''));
  }

  return trimmed.replace(/^['"]|['"]$/g, '');
}

/**
 * Parse YAML front matter from the provided lines.
 *
 * @param {string[]} lines - Lines between the front matter delimiters.
 * @returns {{ frontMatter: Record<string, string | string[]> }} Parsed front matter.
 * @throws {Error} When a line is malformed.
 * @remarks
 * Only simple `key: value` pairs and inline arrays are supported.
 * @example
 * parseFrontMatterLines(['description: Example']);
 */
function parseFrontMatterLines(lines: string[]): {
  frontMatter: Record<string, string | string[]>;
} {
  const frontMatter: Record<string, string | string[]> = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const match = trimmed.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!match) {
      throw new Error('Malformed YAML front matter line.');
    }
    const key = match[1] ?? '';
    const rawValue = match[2] ?? '';
    frontMatter[key] = parseYamlValue(rawValue);
  }
  return { frontMatter };
}

/**
 * Extract the front matter and prompt body from a Copilot agent file.
 *
 * @param {string} content - Full file contents.
 * @param {string} fileName - File name for warning messages.
 * @returns {{ frontMatter: Record<string, string | string[]>; body: string } | null} Parsed data, or null when invalid.
 * @remarks
 * Files without valid front matter are skipped with a warning.
 * @example
 * const parsed = parseAgentFile('---\\ndescription: Example\\n---\\nBody', 'example.agent.md');
 */
function parseAgentFile(
  content: string,
  fileName: string,
): { frontMatter: Record<string, string | string[]>; body: string } | null {
  const located = locateFrontMatter(content, fileName);
  if (!located) {
    return null;
  }

  try {
    const { frontMatter } = parseFrontMatterLines(located.frontMatterLines);
    const body = located.lines.slice(located.bodyStartIndex).join('\n').trim();
    return { frontMatter, body };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `Warning: Copilot agent "${fileName}" has invalid YAML front matter, skipping. Error: ${message}`,
    );
    return null;
  }
}

/**
 * Locate front matter boundaries within a Copilot agent file.
 *
 * @param {string} content - Full file contents.
 * @param {string} fileName - File name for warning messages.
 * @returns {{ frontMatterLines: string[]; bodyStartIndex: number; lines: string[] } | null} Front matter details, or null when missing.
 * @remarks
 * This helper keeps delimiter handling explicit and centralised for reuse.
 * @example
 * const located = locateFrontMatter('---\\ndescription: Example\\n---\\nBody', 'example.agent.md');
 */
function locateFrontMatter(
  content: string,
  fileName: string,
): { frontMatterLines: string[]; bodyStartIndex: number; lines: string[] } | null {
  const trimmedContent = content.trim();
  if (trimmedContent.length === 0) {
    return null;
  }

  const lines = content.trimStart().split(/\r?\n/);
  if (lines[0]?.trim() !== FRONT_MATTER_DELIMITER) {
    console.warn(`Warning: Copilot agent "${fileName}" is missing YAML front matter, skipping.`);
    return null;
  }

  const endIndex = lines.slice(1).findIndex((line) => line.trim() === FRONT_MATTER_DELIMITER);
  if (endIndex === -1) {
    console.warn(`Warning: Copilot agent "${fileName}" is missing closing front matter, skipping.`);
    return null;
  }

  const frontMatterLines = lines.slice(1, endIndex + 1);
  const bodyStartIndex = endIndex + FRONT_MATTER_END_OFFSET;

  return { frontMatterLines, bodyStartIndex, lines };
}

/**
 * Ensure the Copilot agents directory resolves within the current working directory.
 *
 * @returns {string | null} Resolved path or null when the path is outside the repository.
 * @remarks
 * Returning null avoids unexpected filesystem reads outside the project root.
 * @example
 * const agentsPath = resolveAgentsPath();
 */
function resolveAgentsPath(): string | null {
  const agentsPath = path.join(process.cwd(), AGENTS_DIRECTORY);
  const resolvedAgentsPath = path.resolve(agentsPath);
  if (!resolvedAgentsPath.startsWith(process.cwd())) {
    return null;
  }
  return resolvedAgentsPath;
}

/**
 * Resolve the real path for the agents directory.
 *
 * @param {string} resolvedAgentsPath - Resolved agents directory path.
 * @returns {string | null} Real path or null when unavailable or outside the repository.
 * @remarks
 * This guards against symlink escapes when reading agent files.
 * @example
 * const realPath = resolveAgentsRealPath('/repo/.github/agents');
 */
function resolveAgentsRealPath(resolvedAgentsPath: string): string | null {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- resolved path validated and constrained to project files
    const realPath = realpathSync(resolvedAgentsPath);
    if (!realPath.startsWith(process.cwd())) {
      return null;
    }
    return realPath;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Resolve the real path for an agent file and validate it remains inside the agents directory.
 *
 * @param {string} resolvedFilePath - Resolved file path.
 * @param {string} entry - File name for warning messages.
 * @param {string} realAgentsPath - Real path to the agents directory.
 * @returns {string | null} Real path when safe, otherwise null.
 * @remarks
 * Symlinked entries or paths outside the agents directory are rejected.
 * @example
 * const realPath = resolveSafeAgentPath('/repo/.github/agents/agent.md', 'agent.md', '/repo/.github/agents');
 */
function resolveSafeAgentPath(
  resolvedFilePath: string,
  entry: string,
  realAgentsPath: string,
): string | null {
  const stats = readAgentStats(resolvedFilePath, entry);
  if (!stats) {
    return null;
  }

  if (stats.isSymbolicLink()) {
    console.warn(`Warning: Copilot agent "${entry}" is a symlink, skipping.`);
    return null;
  }

  const realFilePath = resolveAgentRealPath(resolvedFilePath, entry);
  if (!realFilePath) {
    return null;
  }

  if (!isAgentPathWithin(realFilePath, realAgentsPath, entry)) {
    return null;
  }

  return realFilePath;
}

/**
 * Read filesystem stats for an agent entry.
 *
 * @param {string} resolvedFilePath - Resolved file path.
 * @param {string} entry - File name for warning messages.
 * @returns {ReturnType<typeof lstatSync> | null} Stats or null on error.
 * @remarks
 * This helper converts stat failures into warnings.
 * @example
 * const stats = readAgentStats('/repo/.github/agents/agent.md', 'agent.md');
 */
function readAgentStats(
  resolvedFilePath: string,
  entry: string,
): ReturnType<typeof lstatSync> | null {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- resolved path validated and constrained to project files
    return lstatSync(resolvedFilePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Warning: Failed to stat Copilot agent "${entry}", skipping. Error: ${message}`);
    return null;
  }
}

/**
 * Resolve the real path for an agent entry.
 *
 * @param {string} resolvedFilePath - Resolved file path.
 * @param {string} entry - File name for warning messages.
 * @returns {string | null} Real path or null on error.
 * @remarks
 * This helper converts resolution failures into warnings.
 * @example
 * const realPath = resolveAgentRealPath('/repo/.github/agents/agent.md', 'agent.md');
 */
function resolveAgentRealPath(resolvedFilePath: string, entry: string): string | null {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- resolved path validated and constrained to project files
    return realpathSync(resolvedFilePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `Warning: Failed to resolve Copilot agent "${entry}" real path, skipping. Error: ${message}`,
    );
    return null;
  }
}

/**
 * Validate that a resolved agent path is within the agents directory.
 *
 * @param {string} realFilePath - Real file path.
 * @param {string} realAgentsPath - Real agents directory path.
 * @param {string} entry - File name for warning messages.
 * @returns {boolean} `true` when the path is safe.
 * @remarks
 * Paths outside the agents directory are rejected to prevent escapes.
 * @example
 * if (!isAgentPathWithin('/repo/.github/agents/agent.md', '/repo/.github/agents', 'agent.md')) return;
 */
function isAgentPathWithin(realFilePath: string, realAgentsPath: string, entry: string): boolean {
  const relativePath = path.relative(realAgentsPath, realFilePath);
  if (relativePath.length === 0 || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    console.warn(
      `Warning: Copilot agent "${entry}" resolves outside the agents directory, skipping.`,
    );
    return false;
  }
  return true;
}

/**
 * Read Copilot agent file names from the agents directory.
 *
 * @param {string} resolvedAgentsPath - Resolved agents directory path.
 * @returns {string[]} Sorted file entries with the `.agent.md` suffix.
 * @remarks
 * Entries are sorted to guarantee deterministic role resolution.
 * @example
 * const entries = readAgentEntries('/repo/.github/agents');
 */
function readAgentEntries(resolvedAgentsPath: string): string[] {
  let entries: string[] = [];
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- resolved path validated and constrained to project files
    entries = readdirSync(resolvedAgentsPath).filter((entry) => isAgentFile(entry));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  return entries.sort((a, b) => a.localeCompare(b));
}

/**
 * Read a Copilot agent file from disk.
 *
 * @param {string} resolvedFilePath - Resolved file path.
 * @param {string} entry - File name for warning messages.
 * @param {string} realAgentsPath - Real path to the agents directory.
 * @returns {string | null} File contents or null when the read fails.
 * @remarks
 * Errors are converted to warnings to keep discovery resilient.
 * @example
 * const contents = readAgentFile('/repo/.github/agents/example.agent.md', 'example.agent.md', '/repo/.github/agents');
 */
function readAgentFile(
  resolvedFilePath: string,
  entry: string,
  realAgentsPath: string,
): string | null {
  const realFilePath = resolveSafeAgentPath(resolvedFilePath, entry, realAgentsPath);
  if (!realFilePath) {
    return null;
  }

  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- resolved path validated and constrained to project files
    return readFileSync(realFilePath, 'utf-8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Warning: Failed to read Copilot agent "${entry}", skipping. Error: ${message}`);
    return null;
  }
}

/**
 * Build a Copilot role template from a parsed agent file.
 *
 * @param {Record<string, string | string[]>} frontMatter - Parsed front matter.
 * @param {string} body - Prompt body.
 * @param {string} entry - File name for fallbacks.
 * @returns {CopilotRoleTemplate | null} Role template or null when required data is missing.
 * @remarks
 * Required fields are validated before the template is created.
 * @example
 * const role = buildRoleTemplate({ description: 'Example' }, 'Body', 'example.agent.md');
 */
function buildRoleTemplate(
  frontMatter: Record<string, string | string[]>,
  body: string,
  entry: string,
): CopilotRoleTemplate | null {
  const description = resolveDescription(frontMatter);
  if (description.length === 0) {
    return null;
  }

  const roleId = resolveRoleId(frontMatter, entry);
  if (roleId.length === 0) {
    return null;
  }

  const metadata = resolveMetadata(frontMatter);

  return {
    id: roleId,
    description,
    prompt: body,
    source: 'copilot',
    metadata,
  };
}

/**
 * Parse front matter for summary-only usage.
 *
 * @param {string} content - Full file contents.
 * @param {string} entry - File name for warning messages.
 * @returns {Record<string, string | string[]> | null} Parsed front matter or null on failure.
 * @remarks
 * This avoids parsing prompt bodies when only role summaries are needed.
 * @example
 * const frontMatter = parseFrontMatterOnly('---\\ndescription: Example\\n---\\nBody', 'example.agent.md');
 */
function parseFrontMatterOnly(
  content: string,
  entry: string,
): Record<string, string | string[]> | null {
  const located = locateFrontMatter(content, entry);
  if (!located) {
    return null;
  }

  try {
    return parseFrontMatterLines(located.frontMatterLines).frontMatter;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `Warning: Copilot agent "${entry}" has invalid YAML front matter, skipping. Error: ${message}`,
    );
    return null;
  }
}

/**
 * Build a Copilot role summary from front matter.
 *
 * @param {Record<string, string | string[]>} frontMatter - Parsed front matter.
 * @param {string} entry - File name for fallback role ids.
 * @returns {CopilotRoleSummary | null} Summary or null when required data is missing.
 * @remarks
 * This avoids including prompt bodies in summary results.
 * @example
 * const summary = buildRoleSummary({ description: 'Example' }, 'example.agent.md');
 */
function buildRoleSummary(
  frontMatter: Record<string, string | string[]>,
  entry: string,
): CopilotRoleSummary | null {
  const description = resolveDescription(frontMatter);
  if (description.length === 0) {
    return null;
  }

  const roleId = resolveRoleId(frontMatter, entry);
  if (roleId.length === 0) {
    return null;
  }

  return { id: roleId, description, source: 'copilot' };
}

/**
 * Track and warn on duplicate Copilot role identifiers.
 *
 * @param {Set<string>} seen - Set of role identifiers already encountered.
 * @param {string} roleId - Role identifier to add.
 * @param {string} entry - File name for warning messages.
 * @returns {boolean} `true` when the role id is already seen.
 * @remarks
 * Duplicate roles are skipped to keep resolution deterministic.
 * @example
 * if (isDuplicateRole(seen, role.id, entry)) return;
 */
function isDuplicateRole(seen: Set<string>, roleId: string, entry: string): boolean {
  if (!seen.has(roleId)) {
    return false;
  }
  console.warn(`Warning: Duplicate Copilot role "${roleId}" found in "${entry}", skipping.`);
  return true;
}

/**
 * Parse and build a Copilot role template for a file entry.
 *
 * @param {string} resolvedAgentsPath - Resolved agents directory path.
 * @param {string} realAgentsPath - Real path to the agents directory.
 * @param {string} entry - File name to read.
 * @returns {CopilotRoleTemplate | null} Role template or null when invalid.
 * @remarks
 * The helper keeps path handling and parsing steps explicit and testable.
 * @example
 * const role = processAgentEntry('/repo/.github/agents', '/repo/.github/agents', 'example.agent.md');
 */
function processAgentEntry(
  resolvedAgentsPath: string,
  realAgentsPath: string,
  entry: string,
): CopilotRoleTemplate | null {
  const filePath = path.join(resolvedAgentsPath, entry);
  const resolvedFilePath = path.resolve(filePath);
  if (!resolvedFilePath.startsWith(resolvedAgentsPath)) {
    return null;
  }

  const contents = readAgentFile(resolvedFilePath, entry, realAgentsPath);
  if (!contents) {
    return null;
  }

  const parsed = parseAgentFile(contents, entry);
  if (!parsed) {
    return null;
  }

  return buildRoleTemplate(parsed.frontMatter, parsed.body, entry);
}

/**
 * Derive the role id from the Copilot agent front matter and file name.
 *
 * @param {Record<string, string | string[]>} frontMatter - Parsed front matter.
 * @param {string} fileName - File name for fallback.
 * @returns {string} Role identifier, or an empty string when none is available.
 * @remarks
 * Uses the `name` field when provided; otherwise falls back to the file name.
 * @example
 * const roleId = resolveRoleId({ name: 'ops-helper' }, 'ops-helper.agent.md');
 */
function resolveRoleId(frontMatter: Record<string, string | string[]>, fileName: string): string {
  const name = frontMatter.name;
  if (typeof name === 'string' && name.trim().length > 0) {
    return name.trim();
  }
  const baseName = path.basename(fileName, AGENT_SUFFIX);
  return baseName.trim();
}

/**
 * Extract the description from Copilot agent front matter.
 *
 * @param {Record<string, string | string[]>} frontMatter - Parsed front matter.
 * @returns {string} Description string, trimmed.
 * @remarks
 * The description is required for valid Copilot agents.
 * @example
 * const description = resolveDescription({ description: 'Example' });
 */
function resolveDescription(frontMatter: Record<string, string | string[]>): string {
  const description = frontMatter.description;
  if (typeof description !== 'string') {
    return '';
  }
  return description.trim();
}

/**
 * Extract optional Copilot metadata fields from front matter.
 *
 * @param {Record<string, string | string[]>} frontMatter - Parsed front matter.
 * @returns {CopilotMetadata} Metadata object, possibly empty.
 * @remarks
 * Unknown fields are ignored to avoid leaking extra data.
 * @example
 * const metadata = resolveMetadata({ tools: ['read'] });
 */
function resolveMetadata(frontMatter: Record<string, string | string[]>): CopilotMetadata {
  const metadata: CopilotMetadata = {};
  const tools = frontMatter.tools;
  if (Array.isArray(tools)) {
    metadata.tools = tools.map((item) => String(item));
  }
  if (typeof frontMatter.model === 'string') {
    metadata.model = frontMatter.model;
  }
  if (typeof frontMatter.target === 'string') {
    metadata.target = frontMatter.target;
  }
  const mcpServers = frontMatter['mcp-servers'];
  if (Array.isArray(mcpServers)) {
    metadata['mcp-servers'] = mcpServers.map((item) => String(item));
  }

  return metadata;
}

/**
 * Build a deterministic list of Copilot agent entries.
 *
 * @returns {CopilotRoleTemplate[]} Parsed Copilot roles with metadata and prompt bodies.
 * @remarks
 * Files are sorted alphabetically to ensure stable resolution and duplicate handling.
 * @example
 * const roles = loadCopilotAgents();
 */
function loadCopilotAgents(): CopilotRoleTemplate[] {
  const resolvedAgentsPath = resolveAgentsPath();
  if (!resolvedAgentsPath) {
    return [];
  }

  const realAgentsPath = resolveAgentsRealPath(resolvedAgentsPath);
  if (!realAgentsPath) {
    return [];
  }

  const sortedEntries = readAgentEntries(resolvedAgentsPath);
  const roles: CopilotRoleTemplate[] = [];
  const seen = new Set<string>();

  for (const entry of sortedEntries) {
    const role = processAgentEntry(resolvedAgentsPath, realAgentsPath, entry);
    if (!role) {
      continue;
    }

    if (isDuplicateRole(seen, role.id, entry)) {
      continue;
    }

    roles.push(role);
    seen.add(role.id);
  }

  return roles;
}

/**
 * Load Copilot role summaries without parsing prompt bodies.
 *
 * @returns {CopilotRoleSummary[]} Parsed Copilot role summaries.
 * @remarks
 * This is used by role listing to avoid unnecessary prompt parsing.
 * @example
 * const roles = loadCopilotRoleSummaries();
 */
function loadCopilotRoleSummaries(): CopilotRoleSummary[] {
  const resolvedAgentsPath = resolveAgentsPath();
  if (!resolvedAgentsPath) {
    return [];
  }

  const realAgentsPath = resolveAgentsRealPath(resolvedAgentsPath);
  if (!realAgentsPath) {
    return [];
  }

  const sortedEntries = readAgentEntries(resolvedAgentsPath);
  const roles: CopilotRoleSummary[] = [];
  const seen = new Set<string>();

  for (const entry of sortedEntries) {
    const summary = buildRoleSummaryFromEntry(resolvedAgentsPath, realAgentsPath, entry);
    if (!summary) {
      continue;
    }

    if (isDuplicateRole(seen, summary.id, entry)) {
      continue;
    }

    roles.push(summary);
    seen.add(summary.id);
  }

  return roles;
}

/**
 * Build a role summary from a single agent file entry.
 *
 * @param {string} resolvedAgentsPath - Resolved agents directory path.
 * @param {string} realAgentsPath - Real agents directory path.
 * @param {string} entry - File name to read.
 * @returns {CopilotRoleSummary | null} Summary or null when invalid.
 * @remarks
 * This helper keeps summary extraction focused and avoids prompt parsing.
 * @example
 * const summary = buildRoleSummaryFromEntry('/repo/.github/agents', '/repo/.github/agents', 'agent.md');
 */
function buildRoleSummaryFromEntry(
  resolvedAgentsPath: string,
  realAgentsPath: string,
  entry: string,
): CopilotRoleSummary | null {
  const filePath = path.join(resolvedAgentsPath, entry);
  const resolvedFilePath = path.resolve(filePath);
  if (!resolvedFilePath.startsWith(resolvedAgentsPath)) {
    return null;
  }

  const contents = readAgentFile(resolvedFilePath, entry, realAgentsPath);
  if (!contents) {
    return null;
  }

  const frontMatter = parseFrontMatterOnly(contents, entry);
  if (!frontMatter) {
    return null;
  }

  return buildRoleSummary(frontMatter, entry);
}

/**
 * List Copilot roles available in `.github/agents`.
 *
 * @returns {CopilotRoleSummary[]} Array of role summaries.
 * @remarks
 * Only roles with valid front matter and a non-empty description are returned.
 * @example
 * const roles = listCopilotRoles();
 */
function listCopilotRoles(): CopilotRoleSummary[] {
  return loadCopilotRoleSummaries();
}

/**
 * Resolve a Copilot role template by role id.
 *
 * @param {string} roleId - Role identifier to resolve.
 * @returns {CopilotRoleTemplate | null} Resolved template or null if not found.
 * @remarks
 * Resolution is deterministic and respects duplicate handling.
 * @example
 * const role = resolveCopilotRole('tester');
 */
function resolveCopilotRole(roleId: string): CopilotRoleTemplate | null {
  const roles = loadCopilotAgents();
  const match = roles.find((role) => role.id === roleId);
  return match ?? null;
}

export { listCopilotRoles, resolveCopilotRole };
export type { CopilotMetadata, CopilotRoleSummary, CopilotRoleTemplate };
