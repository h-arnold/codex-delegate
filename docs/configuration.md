# Configuration

This page explains the configuration file, the most important settings to tweak, and how they
interact with CLI flags.

## Where configuration lives

The CLI loads configuration from `.codex/codex-delegate-config.json` at the project root. You can
create it with:

```bash
codex-delegate init
```

Role templates (agent files) live alongside the config in `.codex/<role>.md`.

## Precedence

Configuration is applied in this order:

1. Built-in defaults
2. `.codex/codex-delegate-config.json`
3. CLI flags

## Key settings to tweak

The following settings are the most commonly adjusted for real-world usage.

### Model selection

- `model` (string): Overrides the default model used by the Codex SDK. Use this to select a
  preferred model for the current workspace or a specific provider.
- `reasoning` (string): Sets reasoning intensity (`minimal`, `low`, `medium`, `high`, `xhigh`).

### Workspace and access

- `workingDir` (string): Sets the default working directory passed to Codex. Use this when your
  tool runs from a mono-repo and you want to lock delegation to a specific package.
- `sandbox` (string): Controls filesystem access (`read-only`, `workspace-write`,
  `danger-full-access`).
- `approval` (string): Determines approval behaviour (`never`, `on-request`, `on-failure`,
  `untrusted`).
- `network` (boolean): Enables or disables network access.
- `webSearch` (string): Controls web search behaviour (`disabled`, `cached`, `live`).

### Output and control

- `verbose` (boolean): Streams all events, suppressing the summary sections.
- `logFile` (string): Writes raw streaming events to the specified file (must be inside the
  project directory).
- `maxItems` (number): Caps the number of entries shown per summary section.
- `timeoutMinutes` (number): Sets the maximum runtime before the stream is cancelled.

### Structured output

- `structured` (boolean): Uses the built-in schema to output structured JSON.
- `schemaFile` (string): Uses a custom JSON schema file (takes precedence over `structured`).

### Wire API override

- `overrideWireApi` (boolean): Forces Codex to use the `responses` wire API by default. If you
  disable this, make sure your `config.toml` uses `responses` or `chat`.

## Example configuration

```json
{
  "model": "gpt-5.2-codex",
  "reasoning": "high",
  "workingDir": "/path/to/repo",
  "sandbox": "workspace-write",
  "approval": "on-request",
  "network": true,
  "webSearch": "cached",
  "verbose": false,
  "timeoutMinutes": 15,
  "maxItems": 50,
  "logFile": "codex-delegate.log",
  "overrideWireApi": true
}
```
