# Codex Delegation

Use the Codex delegation runner to dispatch focused sub-agent tasks while keeping the main context small. It wraps `@openai/codex-sdk` and streams concise output by default. When logging is enabled (via `--verbose` or `--log-file`), it also prints periodic progress snapshots from the log file.

## Quick Start

```bash
codex-delegate --role implementation --task "Add input validation to the assessor controller" --instructions "Use existing DTO patterns; update tests."
```

Roles are defined by prompt templates in `.codex/<role>.md`. Use `--role` to select the template.

## The .codex folder

The `.codex` folder lives at the project root and contains:

- `codex-delegate-config.json` for persistent defaults
- Role templates named `.codex/<role>.md`
- Optional `AGENTS.md` (ignored for role discovery)

The folder is created automatically when you run `codex-delegate init` or the first time configuration is read.

## Role discovery rules

Role names are discovered by scanning `.codex` for markdown files and applying these rules:

- Only `.md` files are considered.
- `AGENTS.md` is always ignored.
- Empty or whitespace-only files are treated as missing.
- Role names are the filename without the `.md` extension.
- Roles are sorted alphabetically before validation.

Use `--list-roles` to print the discovered role names.

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
- `timeout-minutes` defaults to `10` and `verbose` defaults to `false`.
- Prints a short summary of commands, file changes, tool calls, and web searches.
- Use `--max-items` to cap the number of items shown per section.
- Use `--verbose` to stream all events and write the raw log to `codex-delegate.log` (or `--log-file`). While logging is active, the runner prints progress updates every minute, showing the last five log lines.
- Use `--structured` for a built-in JSON schema, or `--schema-file` for a custom schema.

## Configuration defaults and precedence

The CLI loads configuration defaults from `.codex/codex-delegate-config.json` and then applies any CLI overrides.

Precedence order:

1. Built-in defaults
2. `.codex/codex-delegate-config.json`
3. CLI flags

The config file never stores `role`, `task`, or `instructions` because they are CLI-only.

### Default config file

Running `codex-delegate init` creates `.codex/codex-delegate-config.json` with the CLI defaults:

```json
{
  "sandbox": "danger-full-access",
  "approval": "never",
  "network": true,
  "webSearch": "live",
  "verbose": false,
  "timeoutMinutes": 10
}
```

You can also set `model`, `reasoning`, `workingDir`, `structured`, `schemaFile`, `logFile`, and `maxItems` in the config file.

## Suggested Workflow

1. Delegate one focused task at a time (implementation → testing → review → documentation).
2. Keep `--task` short and specific; place constraints in `--instructions`.
3. If the task is repo-specific, pass `--working-dir` to scope context.
