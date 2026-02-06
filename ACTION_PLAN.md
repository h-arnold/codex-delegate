# Action plan: Copilot agent discovery extension

## Overview

This plan extends role discovery to include GitHub Copilot agent profiles alongside existing `.codex` role templates. The goal is to keep the solution modular by introducing an additional role source without altering the current `.codex` behaviours. The approach follows the repository’s coding standards (explicit return types, JSDoc, no `any`) and testing guidance (Vitest under `tests/`).

## TDD action plan

### Phase 0: Baseline checks

1. Confirm current `.codex` role discovery rules and CLI role listing behaviour.
2. Confirm Vitest configuration and test file locations.
3. Confirm TypeScript/JSDoc expectations and British English requirements for user‑facing strings.

### Phase 1: Tests first (expected to fail initially)

1. Add test fixtures under a temporary `.github/agents/` directory.
2. Write new tests for Copilot agent discovery, role aggregation, and prompt resolution.
3. Validate that the merged role list is deterministic and precedence is explicit.
4. Ensure CLI role listing and validation are updated in tests to reference merged roles.

### Phase 2: Implement minimal behaviour to satisfy tests

1. Implement a Copilot agent discovery module that scans `.github/agents/*.agent.md`.
2. Parse YAML front matter, validate required properties, and extract the prompt body.
3. Introduce a role source abstraction and aggregator that combines `.codex` and Copilot sources.
4. Update CLI role listing and role validation to use the merged list.
5. Update prompt building to use Copilot prompt bodies (excluding front matter).

### Phase 3: Refactor for clarity and modularity

1. Ensure `.codex` discovery logic is untouched and wrapped in a source adapter.
2. Keep CLI handling separate from discovery/parsing concerns.
3. Add JSDoc comments to all new functions and classes, with explicit return types.

### Phase 4: Documentation updates

1. Update `docs/codex-delegation.md` to reflect merged role discovery.
2. Update `docs/architecture.md` to mention Copilot agent sources and precedence.
3. Update `README.md` if it describes role discovery or role creation steps.

## Detailed specification

### Copilot agent discovery

**Search path**

- `.github/agents/*.agent.md` at the repository root.

**Front matter parsing**

- Parse YAML front matter and extract properties:
  - Required: `description` (non‑empty).
  - Optional: `name`, `tools`, `model`, `target`, `mcp-servers`.
- Unknown properties are ignored (do not fail parsing).
- Files with invalid YAML are skipped with a warning.
- Empty or whitespace‑only files are ignored.
- Files without YAML front matter are skipped with a warning.

**Role identifier rules**

1. Use `name` if present and non‑blank.
2. Otherwise use the filename without the `.agent.md` suffix.
3. If both are missing/blank, skip the file.

**Prompt extraction rules**

- The prompt template is the Markdown body below the YAML front matter.
- The YAML block must never be included in the prompt passed to the agent.

### Role source abstraction

Introduce a minimal interface and aggregator to keep sources independent.

**Interface**

- `listRoles(): RoleSummary[]` — returns role ids with minimal metadata.
- `resolveTemplate(roleId: string): RoleTemplate | null` — returns the prompt and metadata for a role.

**Sources**

- `.codex` roles via a wrapper around existing `listPromptRoles`/`resolvePromptTemplate`.
- Copilot agents via the new discovery module.

**Aggregation and precedence**

- Merge roles into one deterministic list (alphabetical by role id).
- When identifiers collide between sources, apply a documented precedence rule (e.g. Copilot overrides `.codex` or vice versa). The rule must be reflected in tests and documentation.
- When identifiers collide within the same source (for example, duplicate Copilot role ids), choose the first role by deterministic filename sort order and emit a warning so the behaviour is stable and testable.

### Interaction with the existing system

- **CLI `--list-roles`**: show merged roles rather than `.codex` only.
- **Role validation**: check against merged roles and preserve current warning behaviour when no roles exist.
- **Prompt builder**: take a resolved template object; use the Copilot body as the prompt text.

### Modularity requirements

- The new Copilot discovery module must not import CLI logic.
- The aggregator should be the only module aware of multiple sources.
- Existing `.codex` discovery functions remain unchanged and simply wrapped.

## Examples

### Copilot agent example (testing specialist)

```markdown
---
name: test-specialist
description: Focuses on test coverage and testing best practices
tools: ['read', 'search', 'edit']
---

You are a testing specialist focused on improving code quality through comprehensive testing.
```

### Copilot agent example (implementation planner)

```markdown
---
description: Creates detailed implementation plans and technical specifications
---

You are a technical planning specialist focused on creating comprehensive implementation plans.
```

### Copilot agent example (metadata‑heavy)

```markdown
---
name: ops-helper
description: Assists with operational readiness and runbook updates
model: gpt-5.2-codex
target: github-copilot
tools: ['read', 'search']
---

You are an operational readiness specialist focused on runbooks and deployment safety.
```

## Acceptance criteria

1. Copilot agent files in `.github/agents/*.agent.md` are discovered and parsed correctly.
2. Role list merges `.codex` and Copilot roles deterministically.
3. Role collisions are resolved by a documented precedence rule.
4. Copilot prompts use only the body content (front matter excluded).
5. CLI `--list-roles` and role validation use the merged list.
6. All new code includes explicit return types and JSDoc.
7. All new tests pass with Vitest.

## Constraints

- Use British English for user‑facing strings and documentation.
- Follow repository coding standards (explicit return types, no `any`, JSDoc required).
- Keep tests in `tests/` and run them with Vitest.
- Do not alter existing `.codex` discovery behaviour beyond wrapping.

## Test cases (complete list)

### Copilot agent discovery

1. **COPILOT‑01:** Discover valid `.github/agents/*.agent.md` files.
2. **COPILOT‑02:** Ignore non‑`.agent.md` files in `.github/agents`.
3. **COPILOT‑03:** Skip empty or whitespace‑only files.
4. **COPILOT‑04:** Parse YAML front matter and extract `name` and `description`.
5. **COPILOT‑05:** Skip files missing or blank `description`.
6. **COPILOT‑06:** Use `name` as role id when present.
7. **COPILOT‑07:** Fall back to filename when `name` missing.
8. **COPILOT‑08:** Extract prompt body and exclude front matter.
9. **COPILOT‑09:** Handle malformed YAML by skipping with a warning (no throw).
10. **COPILOT‑10:** Ignore unknown front matter properties without failing.
11. **COPILOT‑11:** Preserve optional metadata (`tools`, `model`, `target`, `mcp-servers`) when present.
12. **COPILOT‑12:** Missing `.github/agents` directory returns an empty role list without throwing.
13. **COPILOT‑13:** Skip files without YAML front matter with a warning.

### Role aggregation

14. **AGG‑01:** Merge `.codex` and Copilot roles into one list.
15. **AGG‑02:** Deterministic sorting (alphabetical by role id).
16. **AGG‑03:** Enforce precedence on identifier collisions.
17. **AGG‑04:** Preserve source metadata for each role.
18. **AGG‑05:** Deterministic resolution when Copilot contains duplicate role ids (first‑wins by filename sort, with a warning).

### Role resolution

19. **RESOLVE‑01:** Resolve `.codex` template when role exists only in `.codex`.
20. **RESOLVE‑02:** Resolve Copilot template body when role exists only in Copilot.
21. **RESOLVE‑03:** Resolve by precedence when role exists in both sources.

### CLI behaviour

22. **CLI‑01:** `--list-roles` outputs merged roles.
23. **CLI‑02:** Role validation uses merged list and error messages list merged roles.
24. **CLI‑03:** With no roles in either source, `--list-roles` prints “No roles available.”

## Checklist to track progress

- [ ] Add Copilot agent discovery tests.
- [ ] Add role aggregation tests.
- [ ] Add prompt resolution tests.
- [ ] Update CLI tests for merged role listing/validation.
- [ ] Implement Copilot discovery module.
- [ ] Implement role source abstraction and aggregator.
- [ ] Update CLI role listing and validation.
- [ ] Update prompt builder.
- [ ] Update documentation.
- [ ] Run `npm run test` and confirm all tests pass.
