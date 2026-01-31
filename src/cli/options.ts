import { handleImmediateFlag } from './help.js';
import type { DelegateOptions } from '../types/delegate-options.js';

/**
 * Defines all supported long-form CLI option aliases.
 */
const ARG_ALIASES: Record<string, keyof DelegateOptions> = {
  '--role': 'role',
  '--task': 'task',
  '--instructions': 'instructions',
  '--model': 'model',
  '--reasoning': 'reasoning',
  '--working-dir': 'workingDir',
  '--sandbox': 'sandbox',
  '--approval': 'approval',
  '--network': 'network',
  '--web-search': 'webSearch',
  '--verbose': 'verbose',
  '--structured': 'structured',
  '--schema-file': 'schemaFile',
  '--log-file': 'logFile',
  '--max-items': 'maxItems',
  '--timeout-minutes': 'timeoutMinutes',
};

/**
 * List of boolean CLI option keys.
 */
const BOOLEAN_KEYS = ['network', 'verbose', 'structured'] as const;

/**
 * Allowed reasoning effort levels.
 */
// cSpell:ignore xhigh
const REASONING_LEVELS = ['minimal', 'low', 'medium', 'high', 'xhigh'] as const;

/**
 * Allowed sandbox mode values.
 */
const SANDBOX_MODES = ['read-only', 'workspace-write', 'danger-full-access'] as const;

/**
 * Allowed approval policy values.
 */
const APPROVAL_POLICIES = ['never', 'on-request', 'on-failure', 'untrusted'] as const;

/**
 * Allowed web search modes.
 */
const WEB_SEARCH_MODES = ['disabled', 'cached', 'live'] as const;

/**
 * Default values for all delegate CLI options.
 */
const DEFAULT_OPTIONS: DelegateOptions = {
  role: 'implementation',
  task: '',
  instructions: '',
  sandbox: 'danger-full-access',
  approval: 'never',
  network: true,
  webSearch: 'live',
  verbose: false,
  timeoutMinutes: 10,
};

type BooleanOptionKey = (typeof BOOLEAN_KEYS)[number];
type ReasoningLevel = (typeof REASONING_LEVELS)[number];

/**
 * Parse a boolean-like string into a boolean value.
 *
 * @param {string} value - The input string to parse. Expected values are exactly 'true' or 'false'.
 * @returns {boolean | undefined} Returns `true` for 'true', `false` for 'false', or `undefined` for any other input.
 * @remarks
 * This helper is intentionally strict and does not perform loose truthy/falsy checks.
 * Use this when parsing explicit CLI boolean arguments.
 * @example
 * parseBoolean('true') // => true
 */
function parseBoolean(value: string): boolean | undefined {
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return undefined;
}

/**
 * Determine whether a token looks like a recognised CLI option.
 *
 * @param {string | undefined} value - The CLI token to test (e.g. '--role').
 * @returns {boolean} `true` if the token begins with `--` and matches a known alias; otherwise `false`.
 * @remarks
 * This only performs syntactic checks and a lookup against `ARG_ALIASES`.
 * @example
 * isOption('--task') // => true
 */
function isOption(value: string | undefined): boolean {
  return Boolean(value && value.startsWith('--') && value in ARG_ALIASES);
}

/**
 * Check if a given option key is a boolean flag.
 *
 * @param {keyof DelegateOptions} key - The option key to test.
 * @returns {key is BooleanOptionKey} Narrowed type predicate indicating the key is a boolean option.
 * @remarks
 * Boolean options are toggles that accept an optional explicit `true`/`false` value or can be specified alone to enable them.
 * @example
 * isBooleanOption('verbose') // => true
 */
function isBooleanOption(key: keyof DelegateOptions): key is BooleanOptionKey {
  return BOOLEAN_KEYS.includes(key as BooleanOptionKey);
}

/**
 * Apply a boolean-style CLI option to the provided `options` object.
 *
 * @param {DelegateOptions} options - The options object to mutate.
 * @param {BooleanOptionKey} key - The boolean option key to set.
 * @param {string | undefined} value - The next argv token, which may be an explicit 'true'/'false' string or another option.
 * @returns {number} The number of argv tokens consumed (1 when the flag was present alone, 2 when an explicit `true`/`false` value was consumed).
 * @remarks
 * If `value` is a non-option token and parses to an explicit boolean, the parsed value is assigned. Otherwise the flag is enabled (`true`).
 * @example
 * const opts = { ...DEFAULT_OPTIONS };
 * applyBooleanOption(opts, 'verbose', 'false') // sets opts.verbose = false and returns 2
 */
function applyBooleanOption(
  options: DelegateOptions,
  key: BooleanOptionKey,
  value: string | undefined,
): number {
  if (value && !isOption(value)) {
    const parsed = parseBoolean(value);
    if (parsed !== undefined) {
      options[key] = parsed;
      return 2;
    }
  }
  options[key] = true;
  return 1;
}

/**
 * Create a mapping of option keys to assignment handlers.
 *
 * @param {DelegateOptions} opts - The options object that handlers will mutate.
 * @returns {Record<string, (v: string) => void>} A map of handler functions keyed by option name.
 * @remarks
 * This helper keeps `parseArgs` concise by encapsulating per-option parsing logic.
 * @example
 * const handlers = createAssignHandlers({ ...DEFAULT_OPTIONS });
 */
function createAssignHandlers(opts: DelegateOptions): Record<string, (v: string) => void> {
  return {
    /**
     * Set the `role` option.
     *
     * @param {string} v - The role name to assign.
     * @returns {void}
     * @remarks
     * This setter applies the value as-is; validation happens later.
     * @example
     * handler('review');
     */
    role: (v: string): void => {
      opts.role = v;
    },
    /**
     * Set the `task` option.
     *
     * @param {string} v - Short description of the task.
     * @returns {void}
     * @remarks
     * The task string is required by the runtime entrypoint.
     * @example
     * handler('Fix bug');
     */
    task: (v: string): void => {
      opts.task = v;
    },
    /**
     * Set the `instructions` option.
     *
     * @param {string} v - Additional instructions for the delegate.
     * @returns {void}
     * @remarks
     * This is an optional string appended to the prompt.
     * @example
     * handler('Focus on tests');
     */
    instructions: (v: string): void => {
      opts.instructions = v;
    },
    /**
     * Set the `model` option.
     *
     * @param {string} v - The Codex model identifier.
     * @returns {void}
     * @remarks
     * The value is passed straight to the Codex client.
     * @example
     * handler('gpt-5');
     */
    model: (v: string): void => {
      opts.model = v;
    },
    /**
     * Set the `reasoning` option.
     *
     * @param {string} v - Reasoning effort level (e.g. 'low', 'medium').
     * @returns {void}
     * @remarks
     * Validation is performed later via `validateOptions`.
     * @example
     * handler('medium');
     */
    reasoning: (v: string): void => {
      opts.reasoning = v;
    },
    /**
     * Set the `workingDir` option.
     *
     * @param {string} v - Path to use as the working directory for the agent.
     * @returns {void}
     * @remarks
     * The path is forwarded to the Codex client as-is.
     * @example
     * handler('/workspace/project');
     */
    workingDir: (v: string): void => {
      opts.workingDir = v;
    },
    /**
     * Set the `sandbox` option.
     *
     * @param {string} v - Sandbox mode string (must match accepted modes).
     * @returns {void}
     * @remarks
     * This setter performs only a narrow cast; validation happens later.
     * @example
     * handler('danger-full-access');
     */
    sandbox: (v: string): void => {
      opts.sandbox = v as DelegateOptions['sandbox'];
    },
    /**
     * Set the `approval` option.
     *
     * @param {string} v - Approval policy string.
     * @returns {void}
     * @remarks
     * Values are validated by `validateOptions`.
     * @example
     * handler('never');
     */
    approval: (v: string): void => {
      opts.approval = v as DelegateOptions['approval'];
    },
    /**
     * Set the `webSearch` option.
     *
     * @param {string} v - Web search mode.
     * @returns {void}
     * @remarks
     * Values are validated by `validateOptions`.
     * @example
     * handler('live');
     */
    webSearch: (v: string): void => {
      opts.webSearch = v as DelegateOptions['webSearch'];
    },
    /**
     * Set the `schemaFile` option.
     *
     * @param {string} v - Path to a JSON schema file.
     * @returns {void}
     * @remarks
     * The schema file is validated later by `resolveOutputSchema`.
     * @example
     * handler('schemas/output.json');
     */
    schemaFile: (v: string): void => {
      opts.schemaFile = v;
    },
    /**
     * Set the `logFile` option.
     *
     * @param {string} v - Path to write event logs.
     * @returns {void}
     * @remarks
     * This path must remain within the project directory when used.
     * @example
     * handler('codex-delegate.log');
     */
    logFile: (v: string): void => {
      opts.logFile = v;
    },
    /**
     * Set the `maxItems` option.
     *
     * @param {string} v - Numeric string to parse as an integer limit for displayed items.
     * @returns {void}
     * @remarks
     * Invalid numbers are ignored.
     * @example
     * handler('5');
     */
    maxItems: (v: string): void => {
      const parsed = Number.parseInt(v, 10);
      if (!Number.isNaN(parsed)) {
        opts.maxItems = parsed;
      }
    },
    /**
     * Set the `timeoutMinutes` option.
     *
     * @param {string} v - Numeric string to parse as a floating-point timeout in minutes.
     * @returns {void}
     * @remarks
     * Values must be greater than zero to take effect.
     * @example
     * handler('2.5');
     */
    timeoutMinutes: (v: string): void => {
      const parsed = Number.parseFloat(v);
      if (!Number.isNaN(parsed) && parsed > 0) {
        opts.timeoutMinutes = parsed;
      }
    },
  };
}

/**
 * Parse an argv-style token array into a fully populated `DelegateOptions` object.
 *
 * @param {string[]} argv - The command-line tokens (typically `process.argv.slice(2)`).
 * @returns {DelegateOptions} A `DelegateOptions` object populated with defaults and any provided overrides.
 * @remarks
 * Supports boolean flags, aliased long-form options (see `ARG_ALIASES`), and simple value assignment. Immediate flags such as `--help` will be handled via `handleImmediateFlag` and may exit the process.
 * @example
 * parseArgs(['--task', 'Run tests', '--verbose']);
 */
function parseArgs(argv: string[]): DelegateOptions {
  const options: DelegateOptions = { ...DEFAULT_OPTIONS };

  const assignHandlers = createAssignHandlers(options);

  for (let i = 0; i < argv.length; ) {
    const arg = argv[i];
    const key = ARG_ALIASES[arg];
    if (!key) {
      i++;
      continue;
    }

    const value = argv[i + 1];
    if (handleImmediateFlag(arg)) {
      i++;
      continue;
    }

    if (isBooleanOption(key)) {
      i += applyBooleanOption(options, key, value);
      continue;
    }

    if (!value || isOption(value)) {
      i++;
      continue;
    }

    const handler = assignHandlers[key as string];
    if (handler) {
      handler(value);
      i += 2;
      continue;
    }

    i++;
  }

  return options;
}

/**
 * Validate that option values are within the set of allowed values.
 *
 * @param {DelegateOptions} options - Parsed options to validate.
 * @returns {void}
 * @throws {Error} If any option contains an invalid literal value.
 * @remarks
 * Ensures `reasoning`, `sandbox`, `approval` and `webSearch` (when present) match the accepted enumerations.
 * @example
 * validateOptions({ ...options });
 */
function validateOptions(options: DelegateOptions): void {
  if (options.reasoning && !REASONING_LEVELS.includes(options.reasoning as ReasoningLevel)) {
    throw new Error(
      `Invalid --reasoning value "${options.reasoning}". Expected one of: ${[
        ...REASONING_LEVELS,
      ].join(', ')}.`,
    );
  }
  if (options.sandbox && !SANDBOX_MODES.includes(options.sandbox)) {
    throw new Error(
      `Invalid --sandbox value "${options.sandbox}". Expected one of: ${[...SANDBOX_MODES].join(
        ', ',
      )}.`,
    );
  }
  if (options.approval && !APPROVAL_POLICIES.includes(options.approval)) {
    throw new Error(
      `Invalid --approval value "${options.approval}". Expected one of: ${[
        ...APPROVAL_POLICIES,
      ].join(', ')}.`,
    );
  }
  if (options.webSearch && !WEB_SEARCH_MODES.includes(options.webSearch)) {
    throw new Error(
      `Invalid --web-search value "${options.webSearch}". Expected one of: ${[
        ...WEB_SEARCH_MODES,
      ].join(', ')}.`,
    );
  }
}

export {
  APPROVAL_POLICIES,
  ARG_ALIASES,
  BOOLEAN_KEYS,
  DEFAULT_OPTIONS,
  REASONING_LEVELS,
  SANDBOX_MODES,
  WEB_SEARCH_MODES,
  applyBooleanOption,
  createAssignHandlers,
  isBooleanOption,
  isOption,
  parseArgs,
  parseBoolean,
  validateOptions,
};
export type { BooleanOptionKey, ReasoningLevel };
