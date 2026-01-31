# Agent Guidance

## Delegating to sub-agents with codex-delegate

Use the `codex-delegate` CLI to spawn focused sub-agents for implementation, testing, review, or documentation tasks. Prefer short, specific tasks and pass repo-scoped instructions. You can run the local CLI via `node bin/codex-delegate.js` (or use an installed `codex-delegate` binary).

Example:

```bash
node bin/codex-delegate.js --role implementation --task "Add input validation to the assessor controller" --instructions "Use existing DTO patterns; update tests." --timeout-minutes 10
```

Key notes:

- Set `--timeout-minutes` to **10 minutes or more** for codex-delegate runs, as some sessions can be long running.
- Pass `--working-dir` for repo-specific tasks.
- Common roles: `implementation`, `testing`, `review`, `documentation`.
- Default permissions are sandboxed with network and web search enabled; override with explicit flags if needed.
- While a sub-agent is running, expect a heartbeat update (`agent is still working`) roughly every minute if no new stream events arrive.

## Coding standards

- Follow the repository code style guide in `docs/code-style.md` (Prettier formatting, ESLint rules, explicit return types, no `any`, and JSDoc requirements).
- Use British English in documentation and user-facing strings.
- Keep tooling configuration files at the repo root and document non-obvious layout choices in `/docs`.

## Common commands

- Install dependencies: `npm install`
- Run tests: `npm run test`
- Build: `npm run build`
- Lint and fix: `npm run lint`
- Format: `npm run format`
- Markdown lint: `npm run lint:md`
- Coverage: `npm run test:cov`
