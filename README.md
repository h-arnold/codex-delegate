# codex-delegate

## What this tool does

`codex-delegate` is a CLI that lets Codex agents spawn focused sub-agents for implementation, testing, review, or documentation tasks. It wraps `@openai/codex-sdk`, keeps the main context small, and provides concise summaries by default so you can delegate safely and return to the main thread quickly.

For more detail, see [`docs/codex-delegation.md`](docs/codex-delegation.md).
Release notes live in [`docs/release-notes.md`](docs/release-notes.md).

## Install from GitHub Packages

> Recommended: Node.js 22+.

1. Configure npm to use the GitHub Packages registry for the scope and authenticate (ensure your
   personal access token includes `read:packages`, plus `repo` if the package is in a private
   repository):

   ```bash
   npm config set @h-arnold:registry https://npm.pkg.github.com/
   npm config set //npm.pkg.github.com/:_authToken=PERSONAL_ACCESS_TOKEN
   ```

2. Install the CLI globally:

   ```bash
   npm install -g @h-arnold/codex-delegate
   ```

3. Run the CLI:

   ```bash
   codex-delegate --help
   ```

## Quick start

```bash
codex-delegate --role implementation --task "Add input validation to the assessor controller" --instructions "Use existing DTO patterns; update tests."
```

## Initialise and add agent files

1. Initialise the `.codex` folder and default config:

   ```bash
   codex-delegate init
   ```

2. Add role templates (agent files) in `.codex/<role>.md`. For example:

   ```bash
   cat <<'EOF' > .codex/implementation.md
   You are an implementation-focused agent. Follow the repo style guide and update tests.
   EOF
   ```

3. Verify the roles are discovered:

   ```bash
   codex-delegate --list-roles
   ```

For a full list of configuration options and recommended settings, see
[`docs/configuration.md`](docs/configuration.md).

## Recommended AGENTS.md guidance

If you maintain a project-level `AGENTS.md`, add a short section so contributors know what this tool is, how to run it, and what to expect when it is working. This snippet includes guidance for Codex agents on how to use `codex-delegate` effectively:

````md
## Codex delegation (codex-delegate)

Use `codex-delegate` to spawn a focused sub-agent for a specific task. Keep tasks small, pass constraints in `--instructions`, and set `--timeout-minutes` to 10 or more for long-running jobs.

Example:

```bash
codex-delegate --role implementation \
  --task "Add input validation to the assessor controller" \
  --instructions "Use existing DTO patterns; update tests." \
  --working-dir packages/my-app \
  --timeout-minutes 10
```
````

While a sub-agent is running, expect a heartbeat line (`agent is still working`) roughly every minute if no new stream events arrive.

## Creating new agents (roles)

Roles are defined by prompt templates in the `.codex` folder. To create a new agent:

1. Create a new file at `.codex/<role>.md` with the prompt template for that role.
2. Keep the template non-empty; empty files are ignored.
3. Run `codex-delegate --list-roles` to confirm it is discovered.
4. Invoke it with `codex-delegate --role <role> --task "..."`.

`AGENTS.md` files inside `.codex` are ignored for role discovery.

## Configuration (.codex)

The CLI uses a per-project `.codex` folder for both configuration and role templates.

- Config file: `.codex/codex-delegate-config.json`
- Role templates: `.codex/<role>.md` (ignored if empty)
- `AGENTS.md` is always ignored for role discovery

Run the init command to create the default config file, or let the CLI create it on first run:

```bash
codex-delegate init
```

Config defaults (stored when the file is first created) come from the CLI defaults:

- `sandbox`: `danger-full-access`
- `approval`: `never`
- `network`: `true`
- `webSearch`: `live`
- `overrideWireApi`: `true`
- `verbose`: `false`
- `timeoutMinutes`: `10`

Role, task, and instructions are CLI-only and are never read from config files.

Config precedence is:

1. Built-in defaults
2. `.codex/codex-delegate-config.json`
3. CLI flags

Wire API note: `codex-delegate` overrides `wire_api` to `responses` by default. If you set `overrideWireApi` to `false`, ensure your Codex `config.toml` uses `wire_api = "responses"` or `wire_api = "chat"` to avoid startup errors. If `responses_websocket` is detected in `config.toml`, `codex-delegate` will isolate `CODEX_HOME` to a local `.codex/codex-home` folder to avoid the failure.

## Development setup

- Husky is used for Git hooks. Hooks are installed automatically when contributors run `npm install` because of the `prepare` script: `"prepare": "husky"`.
- To (re)initialise Husky locally: `npm run husky:init` (runs `npx husky init`).
- To add a hook: `npx husky add .husky/<hook-name> "<command>"` (e.g. `npx husky add .husky/pre-commit "npx --no-install lint-staged"`).

> Pre-commit runs `lint-staged`, which runs `eslint --fix` and `prettier --write` on staged files.

### CI and containers

If you install only production dependencies in CI or Docker you may want to skip Husky there. Set `HUSKY=0` or adapt the `prepare` script (see Husky docs).

---
