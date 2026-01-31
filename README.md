# codex-delegate

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
- `verbose`: `false`
- `timeoutMinutes`: `10`

Role, task, and instructions are CLI-only and are never read from config files.

Config precedence is:

1. Built-in defaults
2. `.codex/codex-delegate-config.json`
3. CLI flags

## Development setup

- Husky is used for Git hooks. Hooks are installed automatically when contributors run `npm install` because of the `prepare` script: `"prepare": "husky"`.
- To (re)initialise Husky locally: `npm run husky:init` (runs `npx husky init`).
- To add a hook: `npx husky add .husky/<hook-name> "<command>"` (e.g. `npx husky add .husky/pre-commit "npx --no-install lint-staged"`).

> Pre-commit runs `lint-staged`, which runs `eslint --fix` and `prettier --write` on staged files.

### CI and containers

If you install only production dependencies in CI or Docker you may want to skip Husky there. Set `HUSKY=0` or adapt the `prepare` script (see Husky docs).

---
