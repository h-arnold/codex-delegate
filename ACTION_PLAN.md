# Action plan: configurable roles and .codex configuration

## Overview

This plan implements `.codex`-based role discovery and a repository-local JSON configuration file, adds an `init` subcommand, and updates CLI/help behaviour to align with the new configuration model. It also enumerates all required tests and documentation updates.

---

## Step-by-step action plan

1. **Introduce `.codex` config and role discovery utilities**
   - Create a dedicated config module to read/write `.codex/codex-delegate-config.json` and to load defaults.
   - Move role discovery and template resolution to `.codex` (ignoring `AGENTS.md`, whitespace-only files, and non-markdown files).
   - Add a warning when no roles are present.

2. **Integrate config defaults into CLI parsing**
   - Read the JSON config before parsing CLI flags and use it to populate defaults for all supported flags **except** `--role`.
   - Preserve CLI precedence: provided CLI flags always override config values.
   - Ensure config file creation happens if missing (see init/autoinit below).

3. **Add `init` subcommand and auto-initialisation**
   - Add a top-level `init` command (e.g. `codex-delegate init`) that creates `.codex/` and `codex-delegate-config.json` with defaults.
   - When running a normal task, auto-create the config file (with defaults) if it does not exist, then proceed.
   - Ensure `init` does not create any role markdown files.

4. **Update prompt building/role validation**
   - Ensure role resolution uses `.codex` templates.
   - When no roles exist, proceed without additional role instructions but warn to stdout.
   - Continue to throw an error for unknown roles **only when** at least one role exists.

5. **Update CLI help, docs, and tests**
   - Update help text to mention `.codex` roles and the `init` subcommand.
   - Add/adjust tests for new config logic, role discovery rules, and init/autoinit behaviour.

---

## Existing code to change (files and required edits)

1. **`src/prompts/prompt-templates.ts`**
   - Update base directory from `src/agent-prompts` to `.codex` in both `resolvePromptTemplate()` and `listPromptRoles()`.
   - Filter out `AGENTS.md`, non-`.md` files, and whitespace-only templates.
   - Ensure template resolution returns `''` for empty content.

2. **`src/cli/options.ts`**
   - Replace static `DEFAULT_OPTIONS` initialisation with defaults loaded from `.codex/codex-delegate-config.json` (excluding `role`).
   - Add parsing for a top-level `init` subcommand or a dedicated early-dispatch path.
   - Ensure CLI overrides still apply and `role` remains CLI-only.

3. **`src/cli/help.ts`**
   - Update help text with `init` subcommand and `.codex` roles/config.

4. **`src/codex-delegate.ts`**
   - Ensure configuration auto-initialisation runs before `parseArgs()` returns (or immediately after parsing but before use).
   - Emit a warning when no roles exist and skip role validation in that case.

5. **`tests/prompt-templates.test.ts`**
   - Update paths from `src/agent-prompts` to `.codex` and adjust fixtures accordingly.
   - Add tests for empty/whitespace markdown and for `AGENTS.md` exclusion.

6. **`tests/cli-parsing.test.ts`** (or new `tests/config.test.ts`)
   - Add tests for config-backed defaults and CLI precedence.
   - Add tests for `init` subcommand behaviour.

7. **`tests/run.test.ts`** (or similar runtime tests)
   - Add tests for warning behaviour when no role files exist.

---

## New code to add (files, classes, methods, functions)

1. **New module: `src/config/codex-config.ts`**
   - `type CodexDelegateConfig`: JSON schema/type for persisted configuration.
   - `const CONFIG_FILE_NAME = 'codex-delegate-config.json'`.
   - `function getCodexConfigDir(): string` — resolves `${process.cwd()}/.codex`.
   - `function getCodexConfigPath(): string` — resolves path to the JSON config file.
   - `function getConfigDefaults(): CodexDelegateConfig` — returns defaults based on current `DEFAULT_OPTIONS` (excluding `role`, `task`, `instructions`).
   - `function readCodexConfig(): CodexDelegateConfig` — reads file, validates shape, falls back to defaults if missing/invalid.
   - `function writeCodexConfig(config: CodexDelegateConfig): void` — writes JSON with stable formatting.
   - `function ensureCodexConfig(): CodexDelegateConfig` — creates directory + config file if missing; returns config.

2. **Optional helper in `src/cli/options.ts`**
   - `function loadDefaultsFromConfig(): DelegateOptions` — composes defaults with config values, leaving `role` as CLI-only.
   - `function parseArgsWithConfig(argv: string[]): DelegateOptions` — wrapper around `parseArgs` if needed for early `init` handling.

3. **New or updated CLI entrypoint logic**
   - `function handleInitCommand(argv: string[]): boolean` — returns true if `init` was invoked and handled.
   - Add logic to `run()` (or a pre-parse dispatcher) to call `ensureCodexConfig()` before normal parsing when config is missing.

---

## Comprehensive test cases (checkboxes)

### Config file defaults and precedence

- [ ] **CFG-01**: When `.codex/codex-delegate-config.json` is missing and `init` is not used, the config file is created with defaults before continuing.
- [ ] **CFG-02**: Defaults are loaded from the config file when no CLI flags are provided (e.g. `network`, `webSearch`, `sandbox`, `approval`, `timeoutMinutes`).
- [ ] **CFG-03**: CLI flags override config values for each supported flag (e.g. `--network false`, `--sandbox read-only`).
- [ ] **CFG-04**: `--role` is never loaded from config and must always come from CLI (or default to implementation).
- [ ] **CFG-05**: Invalid/malformed JSON config gracefully falls back to defaults (with safe error handling).

### Init subcommand

- [ ] **INIT-01**: `codex-delegate init` creates `.codex/` and `codex-delegate-config.json` with defaults.
- [ ] **INIT-02**: `init` does not create any role markdown files.
- [ ] **INIT-03**: Re-running `init` is non-destructive (does not overwrite existing config unless explicitly intended).

### Role discovery and prompt templates

- [ ] **ROLE-01**: `listPromptRoles()` reads from `.codex` and returns sorted role names for non-empty `.md` files.
- [ ] **ROLE-02**: `AGENTS.md` is ignored even if present in `.codex`.
- [ ] **ROLE-03**: Whitespace-only markdown files are ignored.
- [ ] **ROLE-04**: Non-markdown files are ignored.
- [ ] **ROLE-05**: `resolvePromptTemplate()` returns trimmed content for valid templates.
- [ ] **ROLE-06**: `resolvePromptTemplate()` returns an empty string for missing templates or whitespace-only templates.

### Runtime behaviour

- [ ] **RUN-01**: When no roles exist, a warning is written to stdout and execution continues without role instructions.
- [ ] **RUN-02**: When roles exist and `--role` is unknown, an error is thrown listing valid roles.
- [ ] **RUN-03**: `--list-roles` reports available roles from `.codex`.

---

## Documentation updates required

- **`README.md`**: Add sections covering the `.codex` folder, role file discovery rules, config file defaults, and `init` usage.
- **CLI help output (`src/cli/help.ts`)**: Update usage text to mention `.codex` roles and the `init` subcommand.
- **Optional docs in `docs/`** (if there is a CLI or usage guide): Add a configuration page or section describing `.codex` and config/role behaviour.
