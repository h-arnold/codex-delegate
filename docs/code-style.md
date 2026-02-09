# Code Style Guide ✅

This document describes project-wide style and linting rules for `codex-delegate`.
It covers formatting (Prettier), linting (ESLint), TypeScript typing expectations, and **strict JSDoc requirements** for all classes, methods, and functions.

---

## Table of contents

- [Code Style Guide ✅](#code-style-guide-)
  - [Table of contents](#table-of-contents)
  - [Purpose](#purpose)
  - [Formatting (Prettier) ✨](#formatting-prettier-)
  - [Linting (ESLint) 🔍](#linting-eslint-)
  - [TypeScript expectations 🎯](#typescript-expectations-)
  - [JSDoc policy — REQUIRED for every class, method, and function 📝](#jsdoc-policy--required-for-every-class-method-and-function-)
  - [JSDoc Templates \& Examples](#jsdoc-templates--examples)
    - [Function example (exported)](#function-example-exported)
    - [Class and method example](#class-and-method-example)
    - [Arrow function / private helper example](#arrow-function--private-helper-example)
  - [Examples: Good vs Bad](#examples-good-vs-bad)
  - [Tooling \& enforcement ✅](#tooling--enforcement-)
  - [Editor / IDE tips 👩‍💻](#editor--ide-tips-)
  - [Checklist for PRs ✅](#checklist-for-prs-)

## Purpose

This project values consistent, readable, and well-documented code. The rules below are intended to:

- Make reviews quick and predictable
- Ensure APIs are discoverable and well-documented
- Prevent common bugs (via types and linting)

---

## File & folder structure 📁

Consistent project layout makes it easy to find code, tests, and build artifacts. Use a small number of clear conventions and keep the public surface exported from a single entry.

Recommended layout

```text
/src                    # TypeScript source
    /features             # feature or domain folders (e.g. delegates, auth)
        index.ts            # feature-level public exports
        service.ts
        types.ts
        service.spec.ts     # colocated tests (preferred)
    /cli                  # CLI entry points (if any)
    /bin                  # small wrappers or executables
    /internal             # internal-only modules (not exported publicly)
    index.ts              # package public exports (root barrel)
    types.ts              # project-wide types
/tests                  # optional global/integration tests & fixtures
/docs                   # documentation and design notes
/examples               # usage examples
/dist                   # compiled output (gitignored)
/types                  # ambient types or hand-authored d.ts (optional)
package.json
tsconfig.json
eslint.config.js
vitest.config.ts
.prettierrc
```

Guidelines

- Use src/ as the sole authoring location; compile to dist/ and exclude build output from VCS.
- Keep public API exports at src/index.ts (and expose types via package.json "types" or "exports" fields).
- Prefer colocated tests (X.spec.ts next to X.ts) for easy refactors; use a top-level tests/ folder for large integration suites or fixtures.
- Name feature folders by domain (kebab-case) and files so the primary exported symbol is easy to locate (filename ≈ exported name).
- Avoid deep, global barrel files that hide dependency boundaries. Use small feature-level barrels that re-export the feature's public pieces.
- Put internal-only utilities under internal/ or mark them with @internal JSDoc and do not re-export from the package root.
- Keep configs (tsconfig, eslint, vitest) at the repo root and document any non-obvious layout choices in /docs.

Packaging notes

- Ensure package.json "main"/"module"/"types" point to compiled JS and declaration files in dist/.
- Add an exports map if you expose subpath entry points; keep it minimal and stable.
- Do not publish source maps or test-only fixtures unless required.

These conventions keep the repo predictable, make ownership straightforward, and make it easy to produce a clean, typed package for consumers.

## Formatting (Prettier) ✨

- We use **Prettier** to enforce formatting. The project includes `prettier` as a dev dependency and includes a `.prettierrc` with a Markdown override (shorter `printWidth` for `.md` files).
- Command to format the repo:

```bash
npm run format
# or run Prettier directly: prettier --write .
```

- `lint-staged` runs `prettier --write` on staged files as part of the pre-commit hook. See `package.json` for the exact configuration.
- Files to format: all source files and markdown docs in the repository.
- We also include `markdownlint` for stricter Markdown style checks via `.markdownlint.json`. Run `npm run lint:md` to check Markdown files.

---

## Linting (ESLint) 🔍

- ESLint is configured in `eslint.config.js`.
- Key rules to be aware of:
  - `@typescript-eslint/explicit-function-return-type`: **error** — every function and method must have an explicit return type.
  - `@typescript-eslint/no-explicit-any`: **error** — avoid `any`. Use precise types or `unknown` and narrow them as needed.
  - `import/order`: **error** — imports must be grouped and alphabetized as per the config.
  - `no-console`: **warn** (allowed only `warn`, `error`, `info`, `debug`).
  - Security plugin (`eslint-plugin-security`) is enabled; follow its guidance where applicable.
- Type-aware rules (type-checked) are applied to `src/**/*.ts` (project points to `tsconfig.json`).
- Tests get Vitest rules applied as appropriate.

Recommended additional enforcement (optional): enable `eslint-plugin-jsdoc` or a `require-jsdoc` rule if you want automated JSDoc enforcement. See the "Tooling & enforcement" section below for instructions.

---

## TypeScript expectations 🎯

- `tsconfig.json` uses `"strict": true`. Write code assuming all strict checks are on.
- **Do not use `any`**. If an escape hatch is needed, prefer `unknown` and narrow it explicitly.
- Functions and methods must declare explicit return types (per ESLint rule).
- Public API types should be stable and fully typed; small internal helpers should also be typed well.

When in doubt, prefer a small, well-named interface over a large inline object type.

---

## JSDoc policy — REQUIRED for every class, method, and function 📝

All classes, exported functions, and any non-trivial internal functions or methods MUST have a **detailed JSDoc comment** directly above the declaration.

Minimum required tags and content (for every function/method/class):

- Brief one-line summary of what the symbol does.
- `@param {Type} name` — for every parameter, including an explanation of the parameter and whether it's optional.
- `@returns {Type}` (or `@return`) — describe what is returned; explicitly state behavior for `undefined`/`null` and thrown errors.
- `@remarks` — short paragraph describing side effects, complexity, important implementation notes, or alternatives.
- `@example` — one short example showing typical usage (for exported or public APIs).

Optional tags when applicable:

- `@throws {ErrorType}` — what errors may be thrown and when.
- `@deprecated` — if applicable.
- `@internal` / `@private` — to indicate internal-only APIs.

Why JSDoc despite TypeScript types?

- Types express shape, but JSDoc explains intent, edge cases, side effects, and usage notes.
- Good JSDoc speeds up reviews and makes the public API easier to consume.

---

## JSDoc Templates & Examples

### Function example (exported)

```ts
/**
 * Fetches a delegate's metadata and transforms it into the canonical format.
 *
 * @param {string} id - The delegate id to fetch. Must be a non-empty string.
 * @param {{ includeSensitive?: boolean }} [options] - Optional flags that modify the output.
 * @returns {Promise<Delegate>} Resolves to a `Delegate` object with normalized fields.
 * @throws {NotFoundError} If no delegate with the given `id` can be found.
 * @remarks
 * This function will perform up to 3 retries if the remote call fails due to network errors.
 * Use `options.includeSensitive = true` only when running in a trusted environment.
 * @example
 * const d = await getDelegate('abc123', { includeSensitive: false });
 */
export async function getDelegate(
  id: string,
  options?: { includeSensitive?: boolean },
): Promise<Delegate> {
  // implementation
}
```

### Class and method example

```ts
/**
 * A helper for batching multiple actions and flushing them to the API.
 *
 * @remarks
 * The batcher collects actions in-memory then flushes them every N milliseconds.
 */
export class ActionBatcher {
  /**
   * Maximum number of actions to buffer before an immediate flush.
   * @internal
   */
  private readonly maxSize: number;

  /**
   * Creates a new `ActionBatcher`.
   *
   * @param {number} maxSize - Max number of actions to buffer.
   * @param {number} flushIntervalMs - How often to flush if `maxSize` is not reached.
   */
  constructor(
    maxSize: number,
    private flushIntervalMs = 5000,
  ) {
    this.maxSize = maxSize;
  }

  /**
   * Adds an action to the batch.
   *
   * @param {Action} a - The action to add.
   * @returns {void}
   * @remarks
   * Adding an action may trigger an immediate flush if the batch size exceeds `maxSize`.
   */
  add(a: Action): void {}
}
```

### Arrow function / private helper example

```ts
/**
 * Normalize a header name to the project's canonical casing.
 *
 * @param {string} header - Raw HTTP header name
 * @returns {string} Normalized header name
 */
const normalizeHeader = (header: string): string => header.trim().toLowerCase();
```

---

## Examples: Good vs Bad

Good:

```ts
/**
 * Returns the sum of two numbers.
 *
 * @param {number} a - First operand
 * @param {number} b - Second operand
 * @returns {number} The sum of `a` and `b`.
 */
export function add(a: number, b: number): number {
  return a + b;
}
```

Bad (missing JSDoc, missing return type):

```ts
export function add(a, b) {
  return a + b;
}
```

---

## Tooling & enforcement ✅

- Formatting: run `npm run format` or let pre-commit hooks run `prettier` through `lint-staged`.
- Linting: run `npm run lint` and `npm run lint:fix`.
- Pre-commit: Husky + `lint-staged` are configured in `package.json` to auto-run `prettier` and `eslint --fix` on staged files.

To make JSDoc _enforced_ automatically, consider adding `eslint-plugin-jsdoc` and the recommended rules. Example snippet to add to `eslint.config.js` (recommended):

```js
// install: npm i -D eslint-plugin-jsdoc
{
  plugins: { 'jsdoc': require('eslint-plugin-jsdoc') },
  rules: {
    'jsdoc/require-jsdoc': ['error', {
      require: {
        FunctionDeclaration: true,
        MethodDefinition: true,
        ClassDeclaration: true,
        ArrowFunctionExpression: true,
        FunctionExpression: true
      }
    }],
    'jsdoc/require-param': 'error',
    'jsdoc/require-returns': 'error'
  }
}
```

Add the plugin only after verifying compatibility with the `@typescript-eslint` setup.

---

## Editor / IDE tips 👩‍💻

- Install the **ESLint** and **Prettier** extensions in VS Code.
- Recommended settings (in `.vscode/settings.json` or user settings):

```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": { "source.fixAll.eslint": true },
  "eslint.packageManager": "npm"
}
```

- Use an extension that shows JSDoc tooltips (built in TypeScript support in VS Code works well).

---

## Checklist for PRs ✅

- [ ] `npm run format` passes and changes are committed
- [ ] `npm run lint` passes locally (or ESLint fixes applied)
- [ ] All public and internal functions, methods, and classes include JSDoc with `@param`, `@returns`, and `@remarks`/`@example` where applicable
- [ ] No usage of `any` in new code; new types documented and exported where appropriate
