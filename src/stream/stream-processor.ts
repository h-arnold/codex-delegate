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

const DEFAULT_TIMEOUT_MINUTES = 10;
const HEARTBEAT_INTERVAL_MS = 60_000;
type TimeoutControl = { timeoutPromise: Promise<never>; timeoutId: NodeJS.Timeout };
type TurnFailedEvent = Extract<StreamedEvent, { type: 'turn.failed' }>;
type StreamErrorEvent = Extract<StreamedEvent, { type: 'error' }>;

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
  const handler = ITEM_COMPLETED_HANDLERS[item.type];
  if (handler) {
    handler(item, results);
  }
}

/**
 * Store the agent message text as the final response when present.
 *
 * @param {StreamedItem} item - The completed stream item to inspect.
 * @param {StreamResults} results - Accumulator for the final response text.
 * @returns {void}
 * @remarks
 * Only items recognised as agent messages will update the `finalResponse` field.
 * @example
 * handleAgentMessageItem(item, results);
 */
function handleAgentMessageItem(item: StreamedItem, results: StreamResults): void {
  if (isAgentMessage(item)) {
    results.finalResponse = item.text;
  }
}

/**
 * Append a completed command execution to the results list.
 *
 * @param {StreamedItem} item - The completed stream item to inspect.
 * @param {StreamResults} results - Accumulator for command entries.
 * @returns {void}
 * @remarks
 * Only items recognised as command executions will be recorded.
 * @example
 * handleCommandExecutionItem(item, results);
 */
function handleCommandExecutionItem(item: StreamedItem, results: StreamResults): void {
  if (isCommandExecution(item)) {
    results.commands.push(item.command);
  }
}

/**
 * Append file change entries for a completed file change item.
 *
 * @param {StreamedItem} item - The completed stream item to inspect.
 * @param {StreamResults} results - Accumulator for file change summaries.
 * @returns {void}
 * @remarks
 * Each change is stored as a simple `kind: path` string for reporting.
 * @example
 * handleFileChangeItem(item, results);
 */
function handleFileChangeItem(item: StreamedItem, results: StreamResults): void {
  if (isFileChangeItem(item)) {
    const files = item.changes.map((change) => `${change.kind}: ${change.path}`);
    results.fileChanges.push(...files);
  }
}

/**
 * Append MCP tool call entries for a completed tool call item.
 *
 * @param {StreamedItem} item - The completed stream item to inspect.
 * @param {StreamResults} results - Accumulator for tool call summaries.
 * @returns {void}
 * @remarks
 * Tool calls are recorded as `server:tool` strings.
 * @example
 * handleMcpToolCallItem(item, results);
 */
function handleMcpToolCallItem(item: StreamedItem, results: StreamResults): void {
  if (isMcpToolCall(item)) {
    results.toolCalls.push(`${item.server}:${item.tool}`);
  }
}

/**
 * Append web search queries for a completed web search item.
 *
 * @param {StreamedItem} item - The completed stream item to inspect.
 * @param {StreamResults} results - Accumulator for web search queries.
 * @returns {void}
 * @remarks
 * Only items recognised as web searches will be recorded.
 * @example
 * handleWebSearchItem(item, results);
 */
function handleWebSearchItem(item: StreamedItem, results: StreamResults): void {
  if (isWebSearch(item)) {
    results.webQueries.push(item.query);
  }
}

const ITEM_COMPLETED_HANDLERS: Partial<
  Record<StreamedItem['type'], typeof handleAgentMessageItem>
> = {
  agent_message: handleAgentMessageItem,
  command_execution: handleCommandExecutionItem,
  file_change: handleFileChangeItem,
  mcp_tool_call: handleMcpToolCallItem,
  web_search: handleWebSearchItem,
};

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
      process.stdout.write(`Command executed: ${item.command}\n`);
      break;
    case 'file_change':
      if (isFileChangeItem(item)) {
        item.changes.forEach((change) => {
          process.stdout.write(`File change: ${change.kind}: ${change.path}\n`);
        });
      }
      break;
    case 'mcp_tool_call':
      process.stdout.write(`Tool call: ${item.server}:${item.tool}\n`);
      break;
    case 'web_search':
      process.stdout.write(`Web search: ${item.query}\n`);
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
 * Append raw stream events to the log stream and optionally echo to stdout.
 *
 * @param {StreamedEvent} event - Streamed event to serialise.
 * @param {DelegateOptions} options - CLI options controlling verbosity.
 * @param {ReturnType<typeof import('node:fs').createWriteStream> | undefined} logStream - Optional stream to append raw events.
 * @returns {void}
 * @remarks
 * The log stream and verbose stdout echo must preserve existing behaviour.
 * @example
 * logStreamEvent(event, options, logStream);
 */
function logStreamEvent(
  event: StreamedEvent,
  options: DelegateOptions,
  logStream: ReturnType<typeof import('node:fs').createWriteStream> | undefined,
): void {
  if (logStream) {
    logStream.write(JSON.stringify(event) + '\n');
  }
  if (options.verbose) {
    process.stdout.write(JSON.stringify(event) + '\n');
  }
}

/**
 * Determine whether a streamed event contains a completed item payload.
 *
 * @param {StreamedEvent} event - Streamed event to inspect.
 * @returns {boolean} `true` when the event is an item.completed with an item payload.
 */
function isCompletedStreamItem(
  event: StreamedEvent,
): event is StreamedEvent & { type: 'item.completed'; item: StreamedItem } {
  return event.type === 'item.completed' && Boolean(event.item);
}

/**
 * Handle a streamed item.completed event.
 *
 * @param {TurnFailedEvent} event - Streamed event to process.
 * @param {StreamResults} results - Accumulator for parsed stream results.
 * @returns {void}
 * @remarks
 * Only item.completed events with an item are processed.
 * @example
 * handleItemCompletedEvent(event, results);
 */
function handleItemCompletedEvent(event: StreamedEvent, results: StreamResults): void {
  if (!isCompletedStreamItem(event)) {
    return;
  }

  handleItemCompleted(event.item, results);
  emitStreamUpdate(event.item);
}

/**
 * Handle a streamed turn.completed event.
 *
 * @param {StreamErrorEvent} event - Streamed event to process.
 * @param {StreamResults} results - Accumulator for parsed stream results.
 * @returns {void}
 * @remarks
 * Usage summaries are extracted from completed turns.
 * @example
 * handleTurnCompletedEvent(event, results);
 */
function handleTurnCompletedEvent(event: StreamedEvent, results: StreamResults): void {
  if (event.type === 'turn.completed') {
    handleTurnCompleted(event, results);
  }
}

/**
 * Handle a streamed turn.failed event.
 *
 * @param {TurnFailedEvent} event - Streamed event to process.
 * @param {StreamResults} results - Accumulator for parsed stream results.
 * @returns {void}
 * @throws {Error} Always throws when the event represents a failure.
 * @remarks
 * This mirrors the previous error behaviour for failed turns.
 * @example
 * handleTurnFailedEvent(event, results);
 */
function handleTurnFailedEvent(event: TurnFailedEvent, results: StreamResults): void {
  void results;
  throw new Error(event.error?.message ?? 'Unknown error');
}

/**
 * Handle a streamed error event.
 *
 * @param {StreamErrorEvent} event - Streamed event to process.
 * @param {StreamResults} results - Accumulator for parsed stream results.
 * @returns {void}
 * @throws {Error} Always throws when the event represents an error.
 * @remarks
 * This mirrors the previous error behaviour for error events.
 * @example
 * handleStreamErrorEvent(event, results);
 */
function handleStreamErrorEvent(event: StreamErrorEvent, results: StreamResults): void {
  void results;
  throw new Error(event.message ?? 'Unknown error');
}

/**
 * Provide a no-op reject callback placeholder for timeout handling.
 *
 * @param {unknown} [reason] - Optional rejection reason to ignore.
 * @returns {void}
 * @remarks
 * This keeps the timeout control initialised before the real reject callback is assigned.
 * @example
 * const reject = noopReject;
 */
function noopReject(reason?: unknown): void {
  void reason;
}

/**
 * Create a timeout promise and its associated timer id.
 *
 * @param {DelegateOptions} options - CLI options used to format the timeout message.
 * @param {number} timeoutMs - Milliseconds before the timeout triggers.
 * @returns {TimeoutControl} The timeout promise and timer id.
 * @remarks
 * The returned promise rejects when the timeout elapses and is intended for `Promise.race` usage.
 * @example
 * const { timeoutPromise, timeoutId } = createTimeoutControl(options, 600000);
 */
function createTimeoutControl(options: DelegateOptions, timeoutMs: number): TimeoutControl {
  let rejectPromise: (reason?: unknown) => void = noopReject;
  const timeoutPromise = new Promise<never>((_, reject) => {
    rejectPromise = reject;
  });
  const timeoutId = setTimeout(() => {
    rejectPromise(
      new Error(
        `Codex delegation timed out after ${
          options.timeoutMinutes ?? DEFAULT_TIMEOUT_MINUTES
        } minutes.`,
      ),
    );
  }, timeoutMs);

  return { timeoutPromise, timeoutId };
}

/**
 * Start a heartbeat timer that logs inactivity updates.
 *
 * @param {() => number} getLastActivityAt - Callback returning the last activity timestamp.
 * @returns {NodeJS.Timeout} The interval timer id that should be cleared on cleanup.
 * @remarks
 * The heartbeat writes a fixed message when no activity has been observed for the interval duration.
 * @example
 * const intervalId = startHeartbeat(() => lastActivityAt);
 */
function startHeartbeat(getLastActivityAt: () => number): NodeJS.Timeout {
  return setInterval(() => {
    if (Date.now() - getLastActivityAt() >= HEARTBEAT_INTERVAL_MS) {
      process.stdout.write('agent is still working\n');
    }
  }, HEARTBEAT_INTERVAL_MS);
}

/**
 * Handle a streamed event, including optional logging and result accumulation.
 *
 * @param {StreamedEvent} event - Streamed event emitted by Codex.
 * @param {StreamResults} results - Accumulator for parsed stream results.
 * @param {DelegateOptions} options - CLI options controlling logging.
 * @param {ReturnType<typeof import('node:fs').createWriteStream> | undefined} logStream - Optional stream to append raw events.
 * @returns {void}
 * @throws {Error} If the event signals a failure or error.
 * @remarks
 * This helper encapsulates logging and branching over event types to keep the stream loop focused.
 * @example
 * handleStreamEvent(event, results, options, logStream);
 */
function handleStreamEvent(
  event: StreamedEvent,
  results: StreamResults,
  options: DelegateOptions,
  logStream: ReturnType<typeof import('node:fs').createWriteStream> | undefined,
): void {
  logStreamEvent(event, options, logStream);

  switch (event.type) {
    case 'item.completed':
      handleItemCompletedEvent(event, results);
      break;
    case 'turn.completed':
      handleTurnCompletedEvent(event, results);
      break;
    case 'turn.failed':
      handleTurnFailedEvent(event, results);
      break;
    case 'error':
      handleStreamErrorEvent(event, results);
      break;
    default:
      break;
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
  let lastActivityAt = Date.now();
  const { timeoutPromise, timeoutId } = createTimeoutControl(options, timeoutMs);
  const heartbeatIntervalId = startHeartbeat(() => lastActivityAt);

  try {
    while (true) {
      const nextPromise = iterator.next();
      const result = await Promise.race([nextPromise, timeoutPromise]);

      if (result.done) {
        break;
      }

      const event = result.value;
      lastActivityAt = Date.now();
      handleStreamEvent(event, results, options, logStream);
    }
  } finally {
    await iterator.return?.(undefined);
    clearTimeout(timeoutId);
    clearInterval(heartbeatIntervalId);
  }

  return results;
}

export { handleItemCompleted, handleTurnCompleted, processStream };
