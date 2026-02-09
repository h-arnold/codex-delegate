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

### Creating new agents (roles)

Create new roles by adding prompt templates in `.codex/<role>.md`. Keep templates non-empty so they are discovered, and verify with `codex-delegate --list-roles` before running `codex-delegate --role <role> --task "..."`.

## Standard workflow for non-trivial tasks

For any non-trivial change, use a structured implement-and-review loop. The aim is to keep tasks small and focused, make the code changes once, then iterate until the review is clean.

1. **Assign a small, focused task to the implementation agent**
   - Keep the scope narrow: one feature or fix at a time.
   - Provide relevant context, file locations, and constraints.
   - Request updates to tests and documentation where needed.

2. **Implementation agent delivers changes**
   - Makes the minimal change that satisfies the requirements.
   - Runs relevant checks and reports outcomes.

3. **Reviewer agent evaluates the change**
   - Checks structure, correctness, standards, and tests.
   - Provides concrete feedback and makes fixes if required.

4. **Implementer addresses review feedback**
   - Applies changes in response to reviewer notes.
   - Re-runs relevant checks.

5. **Repeat review until clean**
   - Continue the loop until the review comes back clean and no further changes are required.

This is the default workflow for non-trivial tasks and should be followed unless explicitly instructed otherwise.

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
