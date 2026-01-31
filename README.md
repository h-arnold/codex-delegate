# codex-delegate

## Development setup

- Husky is used for Git hooks. Hooks are installed automatically when contributors run `npm install` because of the `prepare` script: `"prepare": "husky"`.
- To (re)initialize Husky locally: `npm run husky:init` (runs `npx husky init`).
- To add a hook: `npx husky add .husky/<hook-name> "<command>"` (e.g. `npx husky add .husky/pre-commit "npx --no-install lint-staged"`).

> Pre-commit runs `lint-staged`, which runs `eslint --fix` and `prettier --write` on staged files.

### CI and containers

If you install only production dependencies in CI or Docker you may want to skip Husky there. Set `HUSKY=0` or adapt the `prepare` script (see Husky docs).

---

(Generated notes about Husky setup.)
