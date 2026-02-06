import { readFileSync, readdirSync } from 'node:fs';
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
  const splitResult = splitFrontMatter(content, fileName);
  if (!splitResult) {
    return null;
  }

  try {
    const { frontMatter } = parseFrontMatterLines(splitResult.frontMatterLines);
    return { frontMatter, body: splitResult.body };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `Warning: Copilot agent "${fileName}" has invalid YAML front matter, skipping. Error: ${message}`,
    );
    return null;
  }
}

/**
 * Split a Copilot agent file into front matter and body sections.
 *
 * @param {string} content - Full file contents.
 * @param {string} fileName - File name for warning messages.
 * @returns {{ frontMatterLines: string[]; body: string } | null} Sections, or null when front matter is missing.
 * @remarks
 * This helper keeps delimiter handling explicit and centralised for reuse.
 * @example
 * const split = splitFrontMatter('---\\ndescription: Example\\n---\\nBody', 'example.agent.md');
 */
function splitFrontMatter(
  content: string,
  fileName: string,
): { frontMatterLines: string[]; body: string } | null {
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
  const body = lines
    .slice(endIndex + FRONT_MATTER_END_OFFSET)
    .join('\n')
    .trim();

  return { frontMatterLines, body };
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
 * @returns {string | null} File contents or null when the read fails.
 * @remarks
 * Errors are converted to warnings to keep discovery resilient.
 * @example
 * const contents = readAgentFile('/repo/.github/agents/example.agent.md', 'example.agent.md');
 */
function readAgentFile(resolvedFilePath: string, entry: string): string | null {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- resolved path validated and constrained to project files
    return readFileSync(resolvedFilePath, 'utf-8');
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
 * Parse and build a Copilot role template for a file entry.
 *
 * @param {string} resolvedAgentsPath - Resolved agents directory path.
 * @param {string} entry - File name to read.
 * @returns {CopilotRoleTemplate | null} Role template or null when invalid.
 * @remarks
 * The helper keeps path handling and parsing steps explicit and testable.
 * @example
 * const role = processAgentEntry('/repo/.github/agents', 'example.agent.md');
 */
function processAgentEntry(resolvedAgentsPath: string, entry: string): CopilotRoleTemplate | null {
  const filePath = path.join(resolvedAgentsPath, entry);
  const resolvedFilePath = path.resolve(filePath);
  if (!resolvedFilePath.startsWith(resolvedAgentsPath)) {
    return null;
  }

  const contents = readAgentFile(resolvedFilePath, entry);
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

  const sortedEntries = readAgentEntries(resolvedAgentsPath);
  const roles: CopilotRoleTemplate[] = [];
  const seen = new Set<string>();

  for (const entry of sortedEntries) {
    const role = processAgentEntry(resolvedAgentsPath, entry);
    if (!role) {
      continue;
    }

    if (seen.has(role.id)) {
      console.warn(`Warning: Duplicate Copilot role "${role.id}" found in "${entry}", skipping.`);
      continue;
    }

    roles.push(role);
    seen.add(role.id);
  }

  return roles;
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
  return loadCopilotAgents().map((role) => ({
    id: role.id,
    description: role.description,
    source: role.source,
  }));
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
