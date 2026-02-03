import type { StreamResults } from '../stream/stream-results.js';
import type { DelegateOptions } from '../types/delegate-options.js';

const JSON_INDENT_SPACES = 2;

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
  writeSummarySection('Commands', results.commands, limit);
  writeSummarySection('File changes', results.fileChanges, limit);
  writeSummarySection('Tool calls', results.toolCalls, limit);
  writeSummarySection('Web searches', results.webQueries, limit);
}

/**
 * Write a summary section to stdout when there are items to report.
 *
 * @param {string} title - Section title to display in the output.
 * @param {readonly string[]} items - Items to include in the summary.
 * @param {number} limit - Maximum number of items to output.
 * @returns {void}
 * @remarks
 * When `items` exceeds the limit, only the first `limit` entries are printed.
 * @example
 * writeSummarySection('Commands', ['ls', 'npm test'], 5);
 */
function writeSummarySection(title: string, items: readonly string[], limit: number): void {
  if (items.length === 0) {
    return;
  }
  const limited = items.slice(0, limit);
  process.stdout.write(`${title}:\n- ${limited.join('\n- ')}\n\n`);
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
      process.stdout.write(JSON.stringify(parsed, null, JSON_INDENT_SPACES) + '\n');
      return;
    } catch {
      // fall through to print raw text
    }
  }
  process.stdout.write(results.finalResponse + '\n');
}

export { printFinalResponse, printSummaries };
