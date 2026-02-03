import fs from 'node:fs';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the codex SDK like other tests to avoid runtime import errors
vi.mock('@openai/codex-sdk', (): { Codex: new () => unknown } => ({
  Codex: class {
    /**
     * Return a mock `startThread` implementation.
     * @returns An object exposing a `runStreamed` method.
     */
    startThread(): {
      runStreamed: () => Promise<{ events: AsyncGenerator<never, void, unknown> }>;
    } {
      return {
        /**
         * Return a promise resolving to an async generator that yields nothing.
         * @returns Promise resolving to an object with `events` async generator.
         */
        runStreamed: async function (): Promise<{ events: AsyncGenerator<never, void, unknown> }> {
          return { events: (async function* (): AsyncGenerator<never, void, unknown> {})() };
        },
      };
    }
  },
}));

let helpers: typeof import('../src/codex-delegate');
beforeEach(async () => {
  // Import fresh after tests potentially spy on path.resolve
  helpers = await import('../src/codex-delegate');
});

describe('Schema Resolution', () => {
  const JSON_INDENT_SPACES = 2;
  const ARRAY_VALUE_TWO = 2;
  const ARRAY_VALUE_THREE = 3;

  const tmpSchema = path.join(process.cwd(), 'src', '__test_schema.json');
  const tmpBad = path.join(process.cwd(), 'src', '__test_schema_bad.json');
  const tmpMalformed = path.join(process.cwd(), 'src', '__test_schema_malformed.json');

  const baseOptions = {
    role: 'test',
    task: 'testing',
    instructions: 'please follow the test instructions',
  };

  afterEach(() => {
    vi.restoreAllMocks();
    try {
      fs.unlinkSync(tmpSchema);
    } catch {}
    try {
      fs.unlinkSync(tmpBad);
    } catch {}
    try {
      fs.unlinkSync(tmpMalformed);
    } catch {}
  });

  it('SCHEMA-01: --structured without schema file returns default schema', () => {
    const defaultSchema = { a: 1 };
    const out = helpers.resolveOutputSchema({ ...baseOptions, structured: true }, defaultSchema);
    expect(out).toEqual(defaultSchema);
  });

  it('SCHEMA-02: valid --schema-file inside project parsed as object', () => {
    const obj = { hello: 'world' };
    fs.writeFileSync(tmpSchema, JSON.stringify(obj, null, JSON_INDENT_SPACES));
    const out = helpers.resolveOutputSchema({ ...baseOptions, schemaFile: tmpSchema }, {});
    expect(out).toEqual(obj);
  });

  it('SCHEMA-03: schema file outside project throws', () => {
    // Spy on path.resolve to simulate resolving outside cwd
    const spy = vi.spyOn(path, 'resolve').mockReturnValue('/outside/project/schema.json');
    try {
      expect(() =>
        helpers.resolveOutputSchema({ ...baseOptions, schemaFile: 'schema.json' }, {}),
      ).toThrow('Schema path must be inside project directory.');
    } finally {
      spy.mockRestore();
    }
  });

  it('SCHEMA-04: schema file that parses but is not object throws', () => {
    fs.writeFileSync(tmpBad, JSON.stringify([1, ARRAY_VALUE_TWO, ARRAY_VALUE_THREE]));
    expect(() => helpers.resolveOutputSchema({ ...baseOptions, schemaFile: tmpBad }, {})).toThrow(
      /must contain a JSON object/,
    );
  });

  it('SCHEMA-05: missing schema file (ENOENT) yields descriptive error', () => {
    const missing = path.join(process.cwd(), 'src', '__this_file_does_not_exist.json');
    expect(() => helpers.resolveOutputSchema({ ...baseOptions, schemaFile: missing }, {})).toThrow(
      new RegExp(`Failed to read or parse schema file at ${missing}`),
    );
  });

  it('SCHEMA-06: malformed JSON parse error mentions path', () => {
    fs.writeFileSync(tmpMalformed, '{ not: valid json }');
    try {
      helpers.resolveOutputSchema({ ...baseOptions, schemaFile: tmpMalformed }, {});
      throw new Error('Expected parse to throw');
    } catch (err) {
      expect(String(err)).toMatch(
        new RegExp(`Failed to read or parse schema file at ${tmpMalformed}`),
      );
      // also ensure parse error text is included
      expect(String(err)).toMatch(/Unexpected token|in JSON at position/);
    }
  });

  it('SCHEMA-07: returns undefined when neither structured nor schemaFile set', () => {
    const out = helpers.resolveOutputSchema({ ...baseOptions }, {});
    expect(out).toBeUndefined();
  });
});
