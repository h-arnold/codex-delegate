import type { StreamResults } from '../stream/stream-results.js';
import type { DelegateOptions } from '../types/delegate-options.js';

/**
 * Print short summaries (commands, file changes, tool calls, web queries) unless verbose mode is enabled.
 *
 * @param {StreamResults} results - The accumulated results to summarise.
 * @param {DelegateOptions} options - Options that control output verbosity and item limits.
 * @returns {void}
 * @remarks
 * When `options.verbose` is set, summaries are suppressed because verbose mode already streams event details.
 * @example
 * printSummaries(results, options);
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
 * @example
 * printFinalResponse(results, outputSchema);
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

export { printFinalResponse, printSummaries };
