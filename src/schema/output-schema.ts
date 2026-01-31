import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { DelegateOptions } from '../types/delegate-options.js';

/**
 * Resolve an output JSON schema to use for structured responses.
 *
 * @param {DelegateOptions} options - Parsed CLI options which may include `schemaFile` or `structured` flags.
 * @param {Record<string, unknown>} defaultSchema - A default schema to use when `--structured` is set without a file.
 * @returns {Record<string, unknown> | undefined} The resolved schema object or `undefined` when structured output is not requested.
 * @throws {Error} If a provided schema file cannot be read or does not contain a root JSON object.
 * @remarks
 * If `options.schemaFile` is provided the file is validated to be inside the project and parsed as JSON.
 * If `options.structured` is true but no `schemaFile` is provided, the provided `defaultSchema` is returned.
 * @example
 * resolveOutputSchema({ structured: true }, defaultSchema);
 */
function resolveOutputSchema(
  options: DelegateOptions,
  defaultSchema: Record<string, unknown>,
): Record<string, unknown> | undefined {
  /**
   * Read and validate that the provided path contains a JSON object at the root.
   *
   * @param {string} schemaPath - Path to the JSON schema file (resolved and checked to be inside project).
   * @returns {Record<string, unknown>} Parsed schema object.
   * @throws {Error} When the file is outside the project or does not contain a top-level object.
   * @remarks
   * This helper ensures the schema path stays within the project directory.
   * @example
   * const schema = readJsonObject('/workspace/project/schema.json');
   */
  const readJsonObject = (schemaPath: string): Record<string, unknown> => {
    const resolved = path.resolve(schemaPath);
    if (!resolved.startsWith(process.cwd())) {
      throw new Error('Schema path must be inside project directory.');
    }
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- resolved path validated to be inside project
    const parsed = JSON.parse(readFileSync(resolved, 'utf-8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    throw new Error(`Schema file at ${schemaPath} must contain a JSON object at the root.`);
  };

  if (options.schemaFile) {
    try {
      const schemaPath = path.resolve(options.schemaFile);
      return readJsonObject(schemaPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to read or parse schema file at ${options.schemaFile}: ${message}`);
    }
  }

  if (options.structured) {
    return defaultSchema;
  }

  return undefined;
}

export { resolveOutputSchema };
