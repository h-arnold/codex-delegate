# Release Notes

## v0.1.1

### Highlights

- Publish releases to the public npm registry with a dedicated GitHub Actions workflow.
- Document public npm installation and publishing guidance alongside GitHub Packages instructions.

### Notes

- CI publishing now expects an `NPM_TOKEN` repository secret with publish permissions.

## v0.1.0

### Highlights

- Initial public release of the `codex-delegate` CLI for delegating focused sub-agent tasks to Codex via `@openai/codex-sdk`.
- Role templates are discovered from `.codex/<role>.md`, with `--list-roles` for quick inspection.
- Configurable defaults via `.codex/codex-delegate-config.json`, plus CLI overrides for model, permissions, and timeouts.
- Human-friendly summaries of commands, file changes, tool calls, and web searches, with an optional structured JSON output mode.
- Progress heartbeat messages and optional log-tail snapshots during long-running tasks.

### Notes

- The CLI defaults to `sandbox=danger-full-access`, `approval=never`, `network=true`, and `webSearch=live` unless overridden.
- Publishing targets GitHub Packages (`@h-arnold/codex-delegate`).
