import { createWriteStream, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { Codex, type StreamedEvent, type StreamedItem } from 'codex-sdk';

// Determine a sensible project-relative "current directory". Prefer the
// directory containing the `src` module when possible; fall back to the
// project's `src` directory in environments where `import.meta.url` cannot be
// resolved by older tooling or during some test harnesses.
/**
 * Determine a safe current directory for the project relative operations.
 * @returns {string} The directory path to use as the current project `src` directory.
 */
function getCurrentDirname(): string {
  try {
    return path.dirname(new URL(import.meta.url).pathname);
  } catch {
    return path.join(process.cwd(), 'src');
  }
}
type DelegateOptions = {
  role: string;
  task: string;
  instructions: string;
  model?: string;
  reasoning?: string;
  workingDir?: string;
  sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access';
  approval?: 'never' | 'on-request' | 'on-failure' | 'untrusted';
  network?: boolean;
  webSearch?: 'disabled' | 'cached' | 'live';
  verbose?: boolean;
  structured?: boolean;
  schemaFile?: string;
  logFile?: string;
  maxItems?: number;
  timeoutMinutes?: number;
};

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

const CURRENT_DIR = getCurrentDirname();

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

const BOOLEAN_KEYS = ['network', 'verbose', 'structured'] as const;
type BooleanOptionKey = (typeof BOOLEAN_KEYS)[number];
// cSpell:ignore xhigh
const REASONING_LEVELS = ['minimal', 'low', 'medium', 'high', 'xhigh'] as const;
type ReasoningLevel = (typeof REASONING_LEVELS)[number];
const SANDBOX_MODES = ['read-only', 'workspace-write', 'danger-full-access'] as const;
const APPROVAL_POLICIES = ['never', 'on-request', 'on-failure', 'untrusted'] as const;
const WEB_SEARCH_MODES = ['disabled', 'cached', 'live'] as const;

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
 * Determine whether a token looks like a recognized CLI option.
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
 * Print the command-line usage information to stdout.
 *
 * @returns {void}
 * @remarks
 * This writes a multi-line help message describing supported CLI flags and exits control flow back to the caller.
 * Typically used in response to `--help` or invalid invocation patterns.
 * @example
 * printHelp()
 */
function printHelp(): void {
  console.info(
    [
      'Usage: node scripts/codex-delegate.js [options]',
      '',
      'Options:',
      '  --role <role>             Role to use (default: implementation)',
      '  --task <task>             Short task description (required)',
      '  --instructions <text>     Additional instructions',
      '  --model <model>           Codex model to use',
      '  --reasoning <level>       Reasoning effort (minimal|low|medium|high|xhigh)',
      '  --working-dir <path>      Working directory for the agent',
      '  --sandbox <mode>          Sandbox mode (read-only|workspace-write|danger-full-access)',
      '  --approval <policy>       Approval policy (never|on-request|on-failure|untrusted)',
      '  --network <true|false>    Enable network access (default: true)',
      '  --web-search <mode>       Web search mode (disabled|cached|live)',
      '  --verbose <true|false>    Enable verbose logging',
      '  --structured <true|false> Emit structured JSON output',
      '  --schema-file <path>      Path to JSON schema file for structured output',
      '  --log-file <path>         Path to write a verbose event log',
      '  --max-items <n>           Limit number of items printed in summaries',
      '  --timeout-minutes <n>     Timeout in minutes (default: 10)',
      '  --list-roles              Print available prompt roles and exit',
      '  --help, -h                Show this help message',
    ].join('\n'),
  );
}

/**
 * Handle flags that require immediate action and may terminate the process.
 *
 * @param {string} arg - The CLI token to evaluate (e.g. '--list-roles' or '--help').
 * @returns {boolean} Returns `false` when no immediate flag was processed. When an immediate flag is detected the function will print the requested information and call `process.exit(0)`.
 * @remarks
 * This helper is used during argument parsing to implement flags that should short-circuit normal execution (listing roles, printing help).
 * @example
 * handleImmediateFlag('--help') // prints help and exits
 */
function handleImmediateFlag(arg: string): boolean {
  if (arg === '--list-roles') {
    const roles = listPromptRoles();
    if (roles.length === 0) {
      console.info('No roles available.');
    } else {
      console.info(`Available roles:\n${roles.join('\n')}`);
    }
    process.exit(0);
  }

  if (arg === '--help' || arg === '-h') {
    printHelp();
    process.exit(0);
  }

  return false;
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
 * Parse an argv-style token array into a fully populated `DelegateOptions` object.
 *
 * @param {string[]} argv - The command-line tokens (typically `process.argv.slice(2)`).
 * @returns {DelegateOptions} A `DelegateOptions` object populated with defaults and any provided overrides.
 * @remarks
 * Supports boolean flags, aliased long-form options (see `ARG_ALIASES`), and simple value assignment. Immediate flags such as `--help` will be handled via `handleImmediateFlag` and may exit the process.
 * @example
 * parseArgs(['--task','"Run tests"','--verbose'])
 */
function parseArgs(argv: string[]): DelegateOptions {
  const options: DelegateOptions = { ...DEFAULT_OPTIONS };

  const ASSIGN_HANDLERS = createAssignHandlers(options);

  /**
   * Create a mapping of option keys to simple assignment handlers used by `parseArgs`.
   *
   * @param {DelegateOptions} opts - The options object that handlers will mutate.
   * @returns {Record<string, (v: string) => void>} A map of handler functions keyed by option name.
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
       */
      role: (v: string): void => {
        opts.role = v;
      },
      /**
       * Set the `task` option.
       *
       * @param {string} v - Short description of the task.
       * @returns {void}
       */
      task: (v: string): void => {
        opts.task = v;
      },
      /**
       * Set the `instructions` option.
       *
       * @param {string} v - Additional instructions for the delegate.
       * @returns {void}
       */
      instructions: (v: string): void => {
        opts.instructions = v;
      },
      /**
       * Set the `model` option.
       *
       * @param {string} v - The Codex model identifier.
       * @returns {void}
       */
      model: (v: string): void => {
        opts.model = v;
      },
      /**
       * Set the `reasoning` option.
       *
       * @param {string} v - Reasoning effort level (e.g. 'low', 'medium').
       * @returns {void}
       */
      reasoning: (v: string): void => {
        opts.reasoning = v;
      },
      /**
       * Set the `workingDir` option.
       *
       * @param {string} v - Path to use as the working directory for the agent.
       * @returns {void}
       */
      workingDir: (v: string): void => {
        opts.workingDir = v;
      },
      /**
       * Set the `sandbox` option.
       *
       * @param {string} v - Sandbox mode string (must match accepted modes).
       * @returns {void}
       */
      sandbox: (v: string): void => {
        opts.sandbox = v as DelegateOptions['sandbox'];
      },
      /**
       * Set the `approval` option.
       *
       * @param {string} v - Approval policy string.
       * @returns {void}
       */
      approval: (v: string): void => {
        opts.approval = v as DelegateOptions['approval'];
      },
      /**
       * Set the `webSearch` option.
       *
       * @param {string} v - Web search mode.
       * @returns {void}
       */
      webSearch: (v: string): void => {
        opts.webSearch = v as DelegateOptions['webSearch'];
      },
      /**
       * Set the `schemaFile` option.
       *
       * @param {string} v - Path to a JSON schema file.
       * @returns {void}
       */
      schemaFile: (v: string): void => {
        opts.schemaFile = v;
      },
      /**
       * Set the `logFile` option.
       *
       * @param {string} v - Path to write event logs.
       * @returns {void}
       */
      logFile: (v: string): void => {
        opts.logFile = v;
      },
      /**
       * Set the `maxItems` option.
       *
       * @param {string} v - Numeric string to parse as an integer limit for displayed items.
       * @returns {void}
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
       */
      timeoutMinutes: (v: string): void => {
        const parsed = Number.parseFloat(v);
        if (!Number.isNaN(parsed) && parsed > 0) {
          opts.timeoutMinutes = parsed;
        }
      },
    };
  }

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

    const handler = ASSIGN_HANDLERS[key as string];
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
 * Resolve and read a prompt template for a given role from the `agent-prompts` directory.
 *
 * @param {string} role - The prompt role name (file `<role>.md` in `agent-prompts`).
 * @returns {string} The template contents trimmed, or an empty string if the template is not found or is outside the project.
 * @remarks
 * This function guards against reading files outside of the project directory and returns an empty string when the role template is missing.
 * @example
 * resolvePromptTemplate('implementation') // => '# Implementation\n...'
 */
function resolvePromptTemplate(role: string): string {
  const fileName = `${role}.md`;
  const templatePath = path.join(CURRENT_DIR, 'agent-prompts', fileName);
  try {
    const resolved = path.resolve(templatePath);
    if (!resolved.startsWith(process.cwd())) {
      // If a template path somehow resolves outside the project, treat as missing
      return '';
    }
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- resolved path is validated and constrained to project files
    return readFileSync(resolved, 'utf-8').trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

/**
 * List available prompt role names by scanning the `agent-prompts` directory.
 *
 * @returns {string[]} A sorted array of role names (file basenames without `.md`), or an empty array if none are found.
 * @remarks
 * This function constrains reads to the project directory and will return an empty array if the prompts directory is missing.
 * @example
 * listPromptRoles() // => ['implementation','review']
 */
function listPromptRoles(): string[] {
  const promptsPath = path.join(CURRENT_DIR, 'agent-prompts');
  try {
    const resolved = path.resolve(promptsPath);
    if (!resolved.startsWith(process.cwd())) {
      return [];
    }
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is resolved and constrained to project files
    return readdirSync(resolved)
      .filter((entry) => entry.endsWith('.md'))
      .map((entry) => entry.replace(/\.md$/, ''))
      .sort((a, b) => a.localeCompare(b));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Build the full prompt text to send to the Codex thread based on resolved template and CLI options.
 *
 * @param {DelegateOptions} options - Parsed invocation options that control role, task and instructions.
 * @returns {string} The composed prompt text, consisting of the role template and optional Instructions/Task sections.
 * @example
 * buildPrompt({ role: 'implementation', task: 'Add tests', instructions: 'Focus on unit tests' })
 */
function buildPrompt(options: DelegateOptions): string {
  const template = resolvePromptTemplate(options.role);
  const sections = [
    template,
    options.instructions ? `Instructions:\n${options.instructions}` : '',
    options.task ? `Task:\n${options.task}` : '',
  ].filter((section) => section.length > 0);

  return sections.join('\n\n');
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
 * validateOptions({ ... }) // throws on invalid values
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
 * resolveOutputSchema({ structured: true }, defaultSchema) // => defaultSchema
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

type StreamResults = {
  commands: string[];
  fileChanges: string[];
  toolCalls: string[];
  webQueries: string[];
  finalResponse: string;
  usageSummary: string;
};

/**
 * Type guard that checks whether a value is a string.
 *
 * @param {unknown} value - The value to test.
 * @returns {value is string} `true` when the value is a string.
 * @example
 * isString('abc') // => true
 */
function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Narrow a `StreamedItem` to an `agent_message` with `text`.
 *
 * @param {StreamedItem} item - The streamed item to test.
 * @returns {item is StreamedItem & { text: string }} Type predicate indicating the item is an agent message containing text.
 */
function isAgentMessage(item: StreamedItem): item is StreamedItem & { text: string } {
  return item.type === 'agent_message' && isString((item as { text?: unknown }).text);
}

/**
 * Narrow a `StreamedItem` to a `command_execution` item containing a `command` string.
 *
 * @param {StreamedItem} item - The streamed item to inspect.
 * @returns {item is StreamedItem & { command: string }} `true` if item.type is 'command_execution' and contains a string command.
 */
function isCommandExecution(item: StreamedItem): item is StreamedItem & { command: string } {
  return item.type === 'command_execution' && isString((item as { command?: unknown }).command);
}

type FileChange = { kind: string; path: string };
/**
 * Validate that an unknown value is an array of file change objects.
 *
 * @param {unknown} changes - The value to validate.
 * @returns {changes is FileChange[]} `true` when the value is an array of objects with string `kind` and `path` properties.
 * @example
 * isFileChangeArray([{ kind: 'modified', path: 'src/index.ts' }]) // => true
 */
function isFileChangeArray(changes: unknown): changes is FileChange[] {
  return (
    Array.isArray(changes) &&
    changes.every(
      (change) =>
        change &&
        typeof change === 'object' &&
        isString((change as { kind?: unknown }).kind) &&
        isString((change as { path?: unknown }).path),
    )
  );
}

/**
 * Narrow a streamed item to a 'file_change' item and validate its `changes` payload.
 *
 * @param {StreamedItem} item - The streamed item to check.
 * @returns {item is StreamedItem & { changes: FileChange[] }} `true` when the item expresses file changes.
 */
function isFileChangeItem(item: StreamedItem): item is StreamedItem & { changes: FileChange[] } {
  return item.type === 'file_change' && isFileChangeArray((item as { changes?: unknown }).changes);
}

/**
 * Narrow a streamed item to an MCP tool call with `server` and `tool` properties.
 *
 * @param {StreamedItem} item - The streamed item to test.
 * @returns {item is StreamedItem & { server: string; tool: string }} `true` when the item is an 'mcp_tool_call' and has string `server` and `tool` fields.
 */
function isMcpToolCall(
  item: StreamedItem,
): item is StreamedItem & { server: string; tool: string } {
  const candidate = item as { server?: unknown; tool?: unknown };
  return item.type === 'mcp_tool_call' && isString(candidate.server) && isString(candidate.tool);
}

/**
 * Narrow a streamed item to a `web_search` item containing a `query` string.
 *
 * @param {StreamedItem} item - The streamed item to inspect.
 * @returns {item is StreamedItem & { query: string }} `true` when the item has type 'web_search' and a string query.
 */
function isWebSearch(item: StreamedItem): item is StreamedItem & { query: string } {
  return item.type === 'web_search' && isString((item as { query?: unknown }).query);
}

/**
 * Process a completed streamed item and merge its data into `results`.
 *
 * @param {StreamedItem} item - The completed item to process (may be one of several types).
 * @param {StreamResults} results - Mutable accumulator for commands, file changes, tool calls, web queries and the final response.
 * @returns {void}
 * @remarks
 * This function inspects the item type and appends parsed details into the corresponding `results` arrays or fields.
 * @example
 * handleItemCompleted(item, results)
 */
function handleItemCompleted(item: StreamedItem, results: StreamResults): void {
  switch (item.type) {
    case 'agent_message':
      if (isAgentMessage(item)) {
        results.finalResponse = item.text;
      }
      break;
    case 'command_execution':
      if (isCommandExecution(item)) {
        results.commands.push(item.command);
      }
      break;
    case 'file_change': {
      if (isFileChangeItem(item)) {
        const files = item.changes.map((change) => `${change.kind}: ${change.path}`);
        results.fileChanges.push(...files);
      }
      break;
    }
    case 'mcp_tool_call':
      if (isMcpToolCall(item)) {
        results.toolCalls.push(`${item.server}:${item.tool}`);
      }
      break;
    case 'web_search':
      if (isWebSearch(item)) {
        results.webQueries.push(item.query);
      }
      break;
    default:
      break;
  }
}

/**
 * Handle a completed turn event to extract usage statistics.
 *
 * @param {StreamedEvent} event - The turn.completed event which may include `usage` information.
 * @param {StreamResults} results - The accumulator to populate with a usage summary string.
 * @returns {void}
 * @example
 * handleTurnCompleted(event, results)
 */
function handleTurnCompleted(event: StreamedEvent, results: StreamResults): void {
  if (event.usage) {
    results.usageSummary = `Usage: input ${event.usage.input_tokens}, output ${event.usage.output_tokens}`;
  }
}

/**
 * Create a fresh, empty `StreamResults` accumulator.
 *
 * @returns {StreamResults} A new results object with empty arrays and strings initialized.
 */
function toStreamResults(): StreamResults {
  return {
    commands: [],
    fileChanges: [],
    toolCalls: [],
    webQueries: [],
    finalResponse: '',
    usageSummary: '',
  };
}

/**
 * Consume the async stream of `StreamedEvent`s and accumulate parsed results.
 *
 * @param {AsyncIterable<StreamedEvent>} events - Async iterable of events from Codex.
 * @param {DelegateOptions} options - CLI options that influence logging and timeouts.
 * @param {ReturnType<typeof createWriteStream> | undefined} logStream - Optional stream to append raw events for debugging.
 * @param {number} timeoutMs - Milliseconds before the overall streaming operation times out.
 * @returns {Promise<StreamResults>} Resolves with the accumulated `StreamResults` once the stream completes.
 * @throws {Error} If the stream emits a `turn.failed` or `error` event, or if the timeout elapses.
 * @remarks
 * This function races the stream iterator against a timeout and gracefully cleans up the iterator on completion or error.
 * @example
 * const results = await processStream(thread.events, options, logStream, 600000);
 */
async function processStream(
  events: AsyncIterable<StreamedEvent>,
  options: DelegateOptions,
  logStream: ReturnType<typeof createWriteStream> | undefined,
  timeoutMs: number,
): Promise<StreamResults> {
  const iterator = events[Symbol.asyncIterator]();
  const results = toStreamResults();
  let timeoutId: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new Error(`Codex delegation timed out after ${options.timeoutMinutes ?? 10} minutes.`),
      );
    }, timeoutMs);
  });

  try {
    while (true) {
      const nextPromise = iterator.next();
      const result = await Promise.race([nextPromise, timeoutPromise]);

      if (result.done) {
        break;
      }

      const event = result.value;

      if (logStream) {
        logStream.write(JSON.stringify(event) + '\n');
      }
      if (options.verbose) {
        process.stdout.write(JSON.stringify(event) + '\n');
      }

      switch (event.type) {
        case 'item.completed':
          if (event.item) {
            handleItemCompleted(event.item, results);
          }
          break;
        case 'turn.completed':
          handleTurnCompleted(event, results);
          break;
        case 'turn.failed':
          throw new Error(event.error?.message ?? 'Unknown error');
        case 'error':
          throw new Error(event.message ?? 'Unknown error');
        default:
          break;
      }
    }
  } finally {
    await iterator.return?.(undefined);
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }

  return results;
}

/**
 * Print short summaries (commands, file changes, tool calls, web queries) unless verbose mode is enabled.
 *
 * @param {StreamResults} results - The accumulated results to summarize.
 * @param {DelegateOptions} options - Options that control output verbosity and item limits.
 * @returns {void}
 * @remarks
 * When `options.verbose` is set, summaries are suppressed because verbose mode already streams event details.
 */
function printSummaries(results: StreamResults, options: DelegateOptions): void {
  if (options.verbose) {
    return;
  }
  const limit = options.maxItems ?? Number.POSITIVE_INFINITY;
  if (results.commands.length > 0) {
    const limited = results.commands.slice(0, limit);
    process.stdout.write(`Commands:\n- ${limited.join('\n- ')}\n\n`);
  }
  if (results.fileChanges.length > 0) {
    const limited = results.fileChanges.slice(0, limit);
    process.stdout.write(`File changes:\n- ${limited.join('\n- ')}\n\n`);
  }
  if (results.toolCalls.length > 0) {
    const limited = results.toolCalls.slice(0, limit);
    process.stdout.write(`Tool calls:\n- ${limited.join('\n- ')}\n\n`);
  }
  if (results.webQueries.length > 0) {
    const limited = results.webQueries.slice(0, limit);
    process.stdout.write(`Web searches:\n- ${limited.join('\n- ')}\n\n`);
  }
}

/**
 * Print the final agent response to stdout, attempting JSON parsing when an `outputSchema` is present.
 *
 * @param {StreamResults} results - Accumulated results containing `finalResponse` text.
 * @param {Record<string, unknown> | undefined} outputSchema - Optional schema that, when present, triggers JSON parsing and pretty-printing.
 * @returns {void}
 * @remarks
 * If `outputSchema` is provided this function attempts to parse `finalResponse` as JSON and will fall back to raw text if parsing fails.
 */
function printFinalResponse(
  results: StreamResults,
  outputSchema: Record<string, unknown> | undefined,
): void {
  if (!results.finalResponse) {
    return;
  }
  if (outputSchema) {
    try {
      const parsed = JSON.parse(results.finalResponse);
      process.stdout.write(JSON.stringify(parsed, null, 2) + '\n');
      return;
    } catch {
      // fall through to print raw text
    }
  }
  process.stdout.write(results.finalResponse + '\n');
}

/**
 * Read the tail (last N lines) of a log file safely, constrained to the project directory.
 *
 * @param {string} logPath - Path to the log file (must reside inside the project directory).
 * @param {number} lineCount - Number of trailing lines to return.
 * @returns {string[]} The last `lineCount` lines of the log, or an empty array if the file is missing or empty.
 * @remarks
 * This helper guards against reading files outside the project directory and returns an empty array on ENOENT.
 */
function tailLogFile(logPath: string, lineCount: number): string[] {
  try {
    const resolved = path.resolve(logPath);
    if (!resolved.startsWith(process.cwd())) {
      return [];
    }
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- resolved path validated and constrained to project files
    const content = readFileSync(resolved, 'utf-8');
    const trimmed = content.trim();
    if (!trimmed) {
      return [];
    }
    const lines = trimmed.split('\n');
    return lines.slice(-lineCount);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Primary program runner: parse arguments, initialize Codex thread, stream results and print summaries.
 *
 * @returns {Promise<void>} Resolves when the delegate completes or rejects on fatal errors.
 * @throws {Error} When required options are missing or validations fail.
 * @remarks
 * This function orchestrates argument parsing, schema resolution, Codex thread setup, and streaming result processing. It handles logging setup and progress reporting.
 */
async function run(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (!options.task) {
    throw new Error('Missing required --task value.');
  }

  const defaultSchema: Record<string, unknown> = {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      status: { type: 'string' },
      risks: { type: 'array', items: { type: 'string' } },
      actions: { type: 'array', items: { type: 'string' } },
      nextSteps: { type: 'array', items: { type: 'string' } },
    },
    required: ['summary', 'status'],
    additionalProperties: true,
  } as const;

  const outputSchema = resolveOutputSchema(options, defaultSchema);
  validateOptions(options);

  const availableRoles = listPromptRoles();
  if (availableRoles.length > 0 && !availableRoles.includes(options.role)) {
    throw new Error(
      `Unknown --role "${options.role}". Available roles: ${availableRoles.join(', ')}.`,
    );
  }

  const codex = new Codex();
  // Ensure the reasoning option is narrowed to the allowed literal union before
  // passing it into the Codex API.
  let reasoningArg: ReasoningLevel | undefined;
  if (options.reasoning && REASONING_LEVELS.includes(options.reasoning as ReasoningLevel)) {
    reasoningArg = options.reasoning as ReasoningLevel;
  }

  const thread = codex.startThread({
    model: options.model,
    modelReasoningEffort: reasoningArg,
    workingDirectory: options.workingDir,
    sandboxMode: options.sandbox,
    approvalPolicy: options.approval,
    networkAccessEnabled: options.network,
    webSearchMode: options.webSearch,
  });

  const prompt = buildPrompt(options);
  const streamed = await thread.runStreamed(prompt, { outputSchema });
  const timeoutMs = (options.timeoutMinutes ?? 10) * 60 * 1000;

  const logPath = options.logFile ?? path.join(process.cwd(), 'codex-delegate.log');
  const shouldLog = options.verbose || Boolean(options.logFile);
  let logStream: ReturnType<typeof createWriteStream> | undefined;
  if (shouldLog) {
    const resolved = path.resolve(logPath);
    if (!resolved.startsWith(process.cwd())) {
      throw new Error('Log file path must be inside project directory.');
    }
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- resolved path validated and constrained to project files
    logStream = createWriteStream(resolved, { flags: 'a' });
  }
  const progressIntervalMs = 60_000;
  let progressInterval: NodeJS.Timeout | undefined;
  if (logStream) {
    progressInterval = setInterval(() => {
      const tail = tailLogFile(logPath, 5);
      if (tail.length === 0) {
        return;
      }
      process.stdout.write(['\nSub-agent progress (last 5 log lines):', ...tail].join('\n') + '\n');
    }, progressIntervalMs);
  }

  try {
    const results = await processStream(streamed.events, options, logStream, timeoutMs);

    printSummaries(results, options);
    printFinalResponse(results, outputSchema);
    if (results.usageSummary) {
      process.stdout.write(results.usageSummary + '\n');
    }
  } finally {
    logStream?.end();
    if (progressInterval) {
      clearInterval(progressInterval);
    }
  }
}

/**
 * Entrypoint wrapper that executes `run` and normalizes uncaught errors to process exit code 1.
 *
 * @returns {Promise<void>} Resolves when `run` completes; on error sets `process.exitCode = 1` and writes the error message to stderr.
 * @example
 * void main()
 */
async function main(): Promise<void> {
  try {
    await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(message + '\n');
    process.exitCode = 1;
  }
}

// Export internal helpers for testing
export {
  parseBoolean,
  isOption,
  isBooleanOption,
  applyBooleanOption,
  parseArgs,
  handleImmediateFlag,
  printHelp,
  resolvePromptTemplate,
  listPromptRoles,
  buildPrompt,
  validateOptions,
  resolveOutputSchema,
  isString,
  isAgentMessage,
  isCommandExecution,
  isFileChangeArray,
  isFileChangeItem,
  isMcpToolCall,
  isWebSearch,
  handleItemCompleted,
  handleTurnCompleted,
  toStreamResults,
  processStream,
  printSummaries,
  printFinalResponse,
  tailLogFile,
  run,
  main,
};

// Run the entrypoint only when not in the test environment to avoid side-effects during imports
if (process.env.NODE_ENV !== 'test') {
  // top-level await is unavailable with CommonJS; call the async entrypoint explicitly
  void main();
}
