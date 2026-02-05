# Testing

This project uses Vitest for unit and integration tests. Test files live in `tests/`.

## Running tests

- Run the full test suite once:
  - `npm run test`
- Run tests in watch mode during development:
  - `npm run test:watch`

## Coverage

- Generate coverage with the V8 provider:
  - `npm run test:cov`

Coverage requires the `@vitest/coverage-v8` dev dependency, which is already included.

## Configuration

Vitest is configured in `vitest.config.ts` with:

- `environment: 'node'` for Node.js APIs.
- `globals: true` so `describe`, `it`, and `expect` are available without imports.
- `include: ['tests/**/*.test.ts']`, which means only TypeScript test files are executed.

JavaScript test files (for example `*.test.js`) are currently ignored; update the include pattern if you want Vitest to run them.

## Conventions

- Keep tests close to their feature area under `tests/`.
- Prefer descriptive test names that reflect user-visible behaviour.
