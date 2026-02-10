---
name: codex-delegate
description: Delegate coding work to focused sub-agents with the codex-delegate CLI. Use when a user asks to split work across implementation, testing, review, or documentation agents, or requests an implementation-review loop for non-trivial repository changes.
---

# codex-delegate

## Discover and choose roles

List available roles in the target repository before delegating, then choose the best role for the task instead of assuming generic role names.

```bash
codex-delegate --list-roles --working-dir "$PWD"
```

If `codex-delegate` is not on `PATH`, run the local CLI:

```bash
node bin/codex-delegate.js --list-roles --working-dir "$PWD"
```

## Run delegated tasks

Use `scripts/run_delegate.sh` for consistent invocation with a minimum timeout of 10 minutes.

```bash
scripts/run_delegate.sh "<role-from-list>" "<specific-task>" "$PWD" "<detailed-context-and-constraints>" 10
```

Prefer specific task and instruction text that includes:

1. Exact scope and expected output.
2. Relevant files or directories.
3. Validation steps to run.
4. Constraints and non-goals.

## Follow the standard loop for non-trivial work

1. Run an implementation task for a narrow scope.
2. Run a review task against the implementation output.
3. Run another implementation task to address review findings.
4. Repeat review until findings are resolved.

## Keep runs reliable

- Pass repository context through the working directory argument.
- Keep timeout values at 10 minutes or more for long-running tasks.
- Use repository-local role definitions and avoid hard-coded role assumptions.
- Keep detailed operational guidance in project docs to preserve lean skill context.

## Read linked docs when needed

- Delegation workflow and behaviour: `docs/codex-delegation.md`
- Configuration options and precedence: `docs/configuration.md`
- Architecture details: `docs/architecture.md`
- Publishing and release context: `docs/publishing.md`, `docs/release-notes.md`
