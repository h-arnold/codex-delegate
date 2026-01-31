import type { ThreadEvent as StreamedEvent, ThreadItem as StreamedItem } from '@openai/codex-sdk';

import {
  isAgentMessage,
  isCommandExecution,
  isFileChangeItem,
  isMcpToolCall,
  isWebSearch,
  toStreamResults,
  type StreamResults,
} from './stream-results.js';
import type { DelegateOptions } from '../types/delegate-options.js';

/**
 * Process a completed streamed item and merge its data into `results`.
 *
 * @param {StreamedItem} item - The completed item to process (may be one of several types).
 * @param {StreamResults} results - Mutable accumulator for commands, file changes, tool calls, web queries and the final response.
 * @returns {void}
 * @remarks
 * This function inspects the item type and appends parsed details into the corresponding `results` arrays or fields.
 * @example
 * handleItemCompleted(item, results);
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
 * Emit a short stdout update when a streamed item completes.
 *
 * @param {StreamedItem} item - The completed item to report.
 * @returns {void}
 * @remarks
 * This is used to provide immediate feedback for commands, file changes, tool calls, and web searches.
 * @example
 * emitStreamUpdate(item);
 */
function emitStreamUpdate(item: StreamedItem): void {
  switch (item.type) {
    case 'command_execution':
      if (isCommandExecution(item)) {
        process.stdout.write(`Command executed: ${item.command}\n`);
      }
      break;
    case 'file_change':
      if (isFileChangeItem(item)) {
        item.changes.forEach((change) => {
          process.stdout.write(`File change: ${change.kind}: ${change.path}\n`);
        });
      }
      break;
    case 'mcp_tool_call':
      if (isMcpToolCall(item)) {
        process.stdout.write(`Tool call: ${item.server}:${item.tool}\n`);
      }
      break;
    case 'web_search':
      if (isWebSearch(item)) {
        process.stdout.write(`Web search: ${item.query}\n`);
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
 * @remarks
 * Usage summaries are stored on the results object for reporting.
 * @example
 * handleTurnCompleted(event, results);
 */
function handleTurnCompleted(event: StreamedEvent, results: StreamResults): void {
  if ('usage' in event && event.usage) {
    const usage = event.usage as { input_tokens: number; output_tokens: number };
    results.usageSummary = `Usage: input ${usage.input_tokens}, output ${usage.output_tokens}`;
  }
}

/**
 * Consume the async stream of `StreamedEvent`s and accumulate parsed results.
 *
 * @param {AsyncIterable<StreamedEvent>} events - Async iterable of events from Codex.
 * @param {DelegateOptions} options - CLI options that influence logging and timeouts.
 * @param {ReturnType<typeof import('node:fs').createWriteStream> | undefined} logStream - Optional stream to append raw events for debugging.
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
  logStream: ReturnType<typeof import('node:fs').createWriteStream> | undefined,
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
            emitStreamUpdate(event.item);
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

export { handleItemCompleted, handleTurnCompleted, processStream };
