# Release Notes

## v0.3.0

### Highlights (v0.3.0)

- Package installable Codex skills under `.agents/skills/codex-delegate` for easier reuse.
- Add dynamic role discovery guidance directly to skill documentation.
- Introduce a `run_delegate.sh` wrapper script with coverage via new tests.
- Improve Copilot agent front matter parsing to align with `.github/agents/multi-agent-planner.agent.md`.

### Notes (v0.3.0)

- Behaviour and compatibility updates include refined skill packaging expectations, role discovery guidance updates, and expanded Copilot YAML front matter support.

## v0.2.0

### Highlights (v0.2.0)

- Discover Copilot agent roles from `.github/agents/*.agent.md`, aggregated with `.codex` roles for `--list-roles` and prompt resolution.
- Parse Copilot agent front matter (name, description, tools, model, MCP servers) to enrich role templates.
- Add a multi-agent planner template and refresh the implementation/reviewer role guidance.

### Notes (v0.2.0)

- Default documentation and testing prompts now live in `.codex`; legacy templates under `src/agent-prompts` were removed.
- Stream reporting now guards file-change logging to avoid mismatched event payloads.
- Added local TypeScript declarations for `@openai/codex-sdk` and compile with an ES2021 target.
- The publish workflow now runs on version tag pushes, uses Node.js 24, runs tests, and then publishes.
- Added repository-level AGENTS guidance and removed the legacy `TEST_CASES.md` file.

## v0.1.1

### Highlights (v0.1.1)

- Publish releases to the public npm registry with a dedicated GitHub Actions workflow.
- Document public npm installation and publishing guidance alongside GitHub Packages instructions.

### Notes (v0.1.1)

- CI publishing now expects an `NPM_TOKEN` repository secret with publish permissions.

## v0.1.0

### Highlights (v0.1.0)

- Initial public release of the `codex-delegate` CLI for delegating focused sub-agent tasks to Codex via `@openai/codex-sdk`.
- Role templates are discovered from `.codex/<role>.md`, with `--list-roles` for quick inspection.
- Configurable defaults via `.codex/codex-delegate-config.json`, plus CLI overrides for model, permissions, and timeouts.
- Human-friendly summaries of commands, file changes, tool calls, and web searches, with an optional structured JSON output mode.
- Progress heartbeat messages and optional log-tail snapshots during long-running tasks.

### Notes (v0.1.0)

- The CLI defaults to `sandbox=danger-full-access`, `approval=never`, `network=true`, and `webSearch=live` unless overridden.
- Publishing targets GitHub Packages (`@h-arnold/codex-delegate`).
