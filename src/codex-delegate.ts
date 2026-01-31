import { createWriteStream } from 'node:fs';
import path from 'node:path';

import { Codex } from '@openai/codex-sdk';

import { handleImmediateFlag, printHelp } from './cli/help.js';
import {
  applyBooleanOption,
  isBooleanOption,
  isOption,
  parseArgs,
  parseBoolean,
  type ReasoningLevel,
  validateOptions,
} from './cli/options.js';
import { ensureCodexConfig } from './config/codex-config.js';
import { tailLogFile } from './logging/logging.js';
import { buildPrompt } from './prompts/prompt-builder.js';
import { listPromptRoles, resolvePromptTemplate } from './prompts/prompt-templates.js';
import { printFinalResponse, printSummaries } from './reporting/reporter.js';
import { resolveOutputSchema } from './schema/output-schema.js';
import {
  handleItemCompleted,
  handleTurnCompleted,
  processStream,
} from './stream/stream-processor.js';
import {
  isAgentMessage,
  isCommandExecution,
  isFileChangeArray,
  isFileChangeItem,
  isMcpToolCall,
  isString,
  isWebSearch,
  toStreamResults,
} from './stream/stream-results.js';
import type { DelegateOptions } from './types/delegate-options.js';

/**
 * Primary program runner: parse arguments, initialise Codex thread, stream results and print summaries.
 *
 * @returns {Promise<void>} Resolves when the delegate completes or rejects on fatal errors.
 * @throws {Error} When required options are missing or validations fail.
 * @remarks
 * This function orchestrates argument parsing, schema resolution, Codex thread setup, and streaming result processing. It handles logging setup and progress reporting.
 * @example
 * await run();
 */
async function run(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv[0] === 'init') {
    ensureCodexConfig();
    return;
  }

  const options = parseArgs(argv);
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
  if (availableRoles.length === 0) {
    process.stderr.write(
      'No roles available in .codex; continuing without role-specific instructions.\n',
    );
  } else if (!availableRoles.includes(options.role)) {
    throw new Error(
      `Unknown --role "${options.role}". Available roles: ${availableRoles.join(', ')}.`,
    );
  }

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

  const codex = new Codex();
  // Ensure the reasoning option is narrowed to the allowed literal union before
  // passing it into the Codex API.
  let reasoningArg: ReasoningLevel | undefined;
  if (options.reasoning) {
    // `validateOptions` has already confirmed that `options.reasoning` is a valid `ReasoningLevel`.
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
 * Entrypoint wrapper that executes `run` and normalises uncaught errors to process exit code 1.
 *
 * @returns {Promise<void>} Resolves when `run` completes; on error sets `process.exitCode = 1` and writes the error message to stderr.
 * @remarks
 * This wrapper keeps CLI error handling consistent for end users.
 * @example
 * void main();
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
  applyBooleanOption,
  buildPrompt,
  handleImmediateFlag,
  handleItemCompleted,
  handleTurnCompleted,
  isAgentMessage,
  isBooleanOption,
  isCommandExecution,
  isFileChangeArray,
  isFileChangeItem,
  isMcpToolCall,
  isOption,
  isString,
  isWebSearch,
  listPromptRoles,
  parseArgs,
  parseBoolean,
  printFinalResponse,
  printHelp,
  printSummaries,
  processStream,
  main,
  resolveOutputSchema,
  resolvePromptTemplate,
  run,
  tailLogFile,
  toStreamResults,
  validateOptions,
};
export type { DelegateOptions, ReasoningLevel };

// Run the entrypoint only when not in the test environment to avoid side-effects during imports
if (process.env.NODE_ENV !== 'test') {
  // top-level await is unavailable with CommonJS; call the async entrypoint explicitly
  void main();
}
