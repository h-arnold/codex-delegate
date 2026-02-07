import { listCopilotRoles, resolveCopilotRole } from './copilot-agents.js';
import { listPromptRoles, resolvePromptTemplate } from './prompt-templates.js';

type RoleSource = 'codex' | 'copilot';

type RoleSummary = {
  id: string;
  source: RoleSource;
  description?: string;
};

type RoleTemplate = {
  id: string;
  source: RoleSource;
  prompt: string;
  description?: string;
  metadata?: Record<string, unknown>;
};

/**
 * List all available roles from Codex and Copilot sources.
 *
 * @returns {RoleSummary[]} Sorted list of role summaries.
 * @remarks
 * Roles are sorted alphabetically and de-duplicated with Codex taking precedence.
 * @example
 * const roles = listRoles();
 */
function listRoles(): RoleSummary[] {
  const rolesById = new Map<string, RoleSummary>();

  for (const role of listCopilotRoles()) {
    rolesById.set(role.id, role);
  }

  for (const roleId of listPromptRoles()) {
    rolesById.set(roleId, { id: roleId, source: 'codex' });
  }

  return Array.from(rolesById.values()).sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Resolve a role template from the aggregated sources.
 *
 * @param {string} roleId - Role identifier to resolve.
 * @returns {RoleTemplate | null} Resolved template or null when missing.
 * @remarks
 * Codex roles take precedence when both sources define the same role id.
 * @example
 * const template = resolveTemplate('implementation');
 */
function resolveTemplate(roleId: string): RoleTemplate | null {
  const prompt = resolvePromptTemplate(roleId);
  if (prompt.length > 0) {
    return { id: roleId, source: 'codex', prompt };
  }

  const copilotRole = resolveCopilotRole(roleId);
  if (!copilotRole) {
    return null;
  }

  return {
    id: copilotRole.id,
    source: copilotRole.source,
    prompt: copilotRole.prompt,
    description: copilotRole.description,
    metadata: copilotRole.metadata,
  };
}

export { listRoles, resolveTemplate };
export type { RoleSummary, RoleTemplate };
