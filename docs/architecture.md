# Codex Delegate Architecture

This document summarises the runtime workflow, main components, and configuration values used by the Codex delegate CLI. It is based on the implementation in `src/` and complements the user-facing guidance in `docs/codex-delegation.md`.

## Runtime workflow

1. The CLI entrypoint (`src/codex-delegate.ts`) parses arguments and loads defaults from the project config (`.codex/codex-delegate-config.json`).
2. It validates option values, checks available roles from `.codex/<role>.md`, and resolves the structured output schema (if requested).
3. Logging is initialised when `--verbose` or `--log-file` is set, with the log file constrained to the project directory.
4. A Codex thread is created via `@openai/codex-sdk` with the selected model, permissions, and working directory.
5. The prompt builder composes the role template, instructions, and task into a single prompt string.
6. The response stream is consumed with:
   - a timeout (based on `timeoutMinutes`),
   - a heartbeat line (`agent is still working`) every 60 seconds of inactivity,
   - optional log-file tail updates when logging is enabled.
7. Streamed items are summarised into commands, file changes, tool calls, and web searches, plus the final response.
8. The CLI prints summaries (unless `--verbose`), renders structured JSON output when a schema is supplied, and emits usage totals if present.

## Components in `src/`

- `src/cli/options.ts`: CLI argument parsing, allowed enum values, and validation.
- `src/cli/help.ts`: `--help` and `--list-roles` handling.
- `src/config/default-options.ts`: Default option values used by both CLI parsing and config initialisation.
- `src/config/codex-config.ts`: Reading, normalising, and writing `.codex/codex-delegate-config.json`.
- `src/prompts/prompt-templates.ts`: Role discovery and template resolution in `.codex`.
- `src/prompts/prompt-builder.ts`: Composes the final prompt.
- `src/stream/stream-processor.ts`: Stream consumption, timeouts, heartbeats, and item processing.
- `src/stream/stream-results.ts`: Streamed item type guards and result aggregation.
- `src/reporting/reporter.ts`: Summary output and final response rendering.
- `src/schema/output-schema.ts`: Structured output schema resolution.
- `src/logging/logging.ts`: Log tail reader for progress snapshots.

## Configuration values

### Defaults

These defaults are defined in `src/config/default-options.ts`. Only non-CLI values are persisted by `codex-delegate init` (the config file excludes `role`, `task`, and `instructions`).

```text
sandbox: "danger-full-access"
approval: "never"
network: true
webSearch: "live"
verbose: false
timeoutMinutes: 10
overrideWireApi: true
```

### Allowed enum values

`src/cli/options.ts` constrains the following values:

- `reasoning`: `minimal`, `low`, `medium`, `high`, `xhigh`
- `sandbox`: `read-only`, `workspace-write`, `danger-full-access`
- `approval`: `never`, `on-request`, `on-failure`, `untrusted`
- `webSearch`: `disabled`, `cached`, `live`

### Config file scope

The `.codex/codex-delegate-config.json` file stores all options except `role`, `task`, and `instructions` (those are CLI-only). Unknown keys are ignored, and invalid types are discarded during normalisation.

### Structured output

- `--structured` uses the built-in schema from `src/codex-delegate.ts`.
- `--schema-file` loads a JSON schema from disk and must point to a path inside the project directory.
- If both are supplied, the schema file takes precedence.

### Wire API configuration

`codex-delegate` sets `wire_api` to `responses` by default when `overrideWireApi` is enabled. Codex only accepts `responses` and `chat` for `wire_api`, so avoid `responses_websocket` in `config.toml` to prevent startup errors. If you set `overrideWireApi` to `false`, `codex-delegate` will not change `wire_api`, so any invalid value in `config.toml` will still cause startup failures. When `responses_websocket` is detected, `codex-delegate` uses a local `CODEX_HOME` under `.codex/codex-home` so the bundled CLI can start without the invalid config.

### Logging and summaries

- `--verbose` streams every event and suppresses summary sections.
- `--log-file` writes raw streamed events; when enabled, a progress snapshot prints the last five log lines every minute.
- `--max-items` limits the number of entries printed in summary sections.

## Behaviour notes

- The `init` command creates the `.codex` directory and the default config file if missing.
- Role templates are discovered by scanning `.codex` for non-empty `.md` files, excluding `AGENTS.md`.
- All file reads for templates, schemas, and logs are constrained to the current project directory.
