# Codex Delegation

Use the Codex delegation runner to dispatch focused sub-agent tasks while keeping the main context small. It wraps `@openai/codex-sdk` and streams concise output by default. When logging is enabled (via `--verbose` or `--log-file`), it also prints periodic progress snapshots from the log file.

## Quick Start

```bash
npm run dev:delegate -- --role implementation --task "Add input validation to the assessor controller" --instructions "Use existing DTO patterns; update tests."
```

Roles are defined by prompt templates in `scripts/agent-prompts/*.md`. Use `--role` to select the template.

## Common Options

- `--role` (implementation, testing, review, documentation)
- `--task` (required)
- `--instructions` (optional, appended to the prompt)
- `--model`, `--reasoning`, `--working-dir` (model and workspace selection)
- `--sandbox`, `--approval`, `--network`, `--web-search` (permission controls)
- `--structured`, `--schema-file` (structured output)
- `--verbose`, `--log-file`, `--max-items`, `--timeout-minutes` (output controls)

## Defaults and Behaviour

- Defaults to `sandbox=danger-full-access`, `approval=never`, `network=true`, and `web-search=live`.
- Prints a short summary of commands, file changes, tool calls, and web searches.
- Use `--max-items` to cap the number of items shown per section.
- Use `--verbose` to stream all events and write the raw log to `codex-delegate.log` (or `--log-file`). While logging is active, the runner prints progress updates every minute, showing the last five log lines.
- Use `--structured` for a built-in JSON schema, or `--schema-file` for a custom schema.

## Suggested Workflow

1. Delegate one focused task at a time (implementation → testing → review → documentation).
2. Keep `--task` short and specific; place constraints in `--instructions`.
3. If the task is repo-specific, pass `--working-dir` to scope context.
