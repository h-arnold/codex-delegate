# Codex Delegation

Use the Codex delegation runner to dispatch focused sub-agent tasks while keeping the main context small. It wraps `@openai/codex-sdk` and streams concise output by default. When logging is enabled (via `--verbose` or `--log-file`), it also prints periodic progress snapshots from the log file.

For implementation details on workflow, components, and configuration values, see [`docs/architecture.md`](docs/architecture.md).
For a detailed configuration reference, see [`docs/configuration.md`](docs/configuration.md).

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

## Prerequisites

- Node.js 22+ and npm available in your environment.
- Access to the Codex CLI via `@openai/codex-sdk`. The Codex CLI, IDE plugin, and web/desktop
  app inject an OpenAI API key into the environment automatically, so you should not need to
  configure credentials manually in most setups.
- A project root with a `.codex` folder for config and role templates.

## Common Options

- `--role` (implementation, testing, review, documentation)
- `--task` (required)
- `--instructions` (optional, appended to the prompt)
- `--model`, `--reasoning`, `--working-dir` (model and workspace selection)
- `--sandbox`, `--approval`, `--network`, `--web-search` (permission controls)
- `--override-wire-api <true|false>` (force the Codex CLI to use the responses wire API; defaults to `true`)
- `--structured`, `--schema-file` (structured output)
- `--verbose`, `--log-file`, `--max-items`, `--timeout-minutes` (output controls)

## Defaults and Behaviour

- Defaults to `sandbox=danger-full-access`, `approval=never`, `network=true`, and `web-search=live`.
- `timeout-minutes` defaults to `10` and `verbose` defaults to `false`.
- Uses the standard responses API wire mode by default to avoid unsupported websocket variants.
- Prints a short summary of commands, file changes, tool calls, and web searches.
- Emits a heartbeat line (`agent is still working`) every minute when no stream events arrive, so long-running tasks still show activity.
- Use `--max-items` to cap the number of items shown per section.
- Use `--verbose` to stream all events and write the raw log to `codex-delegate.log` (or `--log-file`). While logging is active, the runner prints progress updates every minute, showing the last five log lines.
- Use `--structured` for a built-in JSON schema, or `--schema-file` for a custom schema.

## Troubleshooting

### No roles found

- Ensure your role files live in `.codex/<role>.md` and are not empty.
- Run `codex-delegate --list-roles` to confirm discovery.
- Remember `AGENTS.md` is ignored for role discovery.

### Wire API errors

- Codex only supports `responses` or `chat` for `wire_api`. Update `config.toml` if you see
  `responses_websocket`.
- Leave `overrideWireApi` enabled unless you have a supported `config.toml`.

### Log file errors

- The log file must be inside the project directory. If you pass an absolute path outside the
  repo, the CLI will reject it.

## Wire API setting

Codex only supports `wire_api` values of `responses` and `chat` for model providers. If your `config.toml` includes `responses_websocket`, update it to `responses` to avoid startup failures. If you disable `--override-wire-api`, ensure `config.toml` stays on a supported value. When `responses_websocket` is detected, `codex-delegate` will fall back to a local `CODEX_HOME` under `.codex/codex-home` to prevent the CLI from failing to start.

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
  "overrideWireApi": true,
  "verbose": false,
  "timeoutMinutes": 10
}
```

You can also set `model`, `reasoning`, `workingDir`, `structured`, `schemaFile`, `logFile`, and `maxItems` in the config file.

## Suggested Workflow

1. Delegate one focused task at a time (implementation → testing → review → documentation).
2. Keep `--task` short and specific; place constraints in `--instructions`.
3. If the task is repo-specific, pass `--working-dir` to scope context.
