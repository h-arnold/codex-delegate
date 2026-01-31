import type { StreamedItem } from 'codex-sdk';

/**
 * Aggregated results extracted from streamed events.
 */
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
 * @remarks
 * Use this helper to safely narrow unknown stream payloads.
 * @example
 * isString('abc');
 */
function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Narrow a `StreamedItem` to an `agent_message` with `text`.
 *
 * @param {StreamedItem} item - The streamed item to test.
 * @returns {item is StreamedItem & { text: string }} Type predicate indicating the item is an agent message containing text.
 * @remarks
 * This guard is used to safely access `item.text`.
 * @example
 * if (isAgentMessage(item)) console.log(item.text);
 */
function isAgentMessage(item: StreamedItem): item is StreamedItem & { text: string } {
  return item.type === 'agent_message' && isString((item as { text?: unknown }).text);
}

/**
 * Narrow a `StreamedItem` to a `command_execution` item containing a `command` string.
 *
 * @param {StreamedItem} item - The streamed item to inspect.
 * @returns {item is StreamedItem & { command: string }} `true` if item.type is 'command_execution' and contains a string command.
 * @remarks
 * Use this guard before pushing commands into summaries.
 * @example
 * if (isCommandExecution(item)) commands.push(item.command);
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
 * @remarks
 * This guard ensures file change summaries can be safely generated.
 * @example
 * isFileChangeArray([{ kind: 'modified', path: 'src/index.ts' }]);
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
 * @remarks
 * This guard ensures `changes` contains well-formed entries.
 * @example
 * if (isFileChangeItem(item)) console.log(item.changes.length);
 */
function isFileChangeItem(item: StreamedItem): item is StreamedItem & { changes: FileChange[] } {
  return item.type === 'file_change' && isFileChangeArray((item as { changes?: unknown }).changes);
}

/**
 * Narrow a streamed item to an MCP tool call with `server` and `tool` properties.
 *
 * @param {StreamedItem} item - The streamed item to test.
 * @returns {item is StreamedItem & { server: string; tool: string }} `true` when the item is an 'mcp_tool_call' and has string `server` and `tool` fields.
 * @remarks
 * Use this guard before building tool call summaries.
 * @example
 * if (isMcpToolCall(item)) console.log(item.server, item.tool);
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
 * @remarks
 * This guard ensures queries can be appended to summaries.
 * @example
 * if (isWebSearch(item)) queries.push(item.query);
 */
function isWebSearch(item: StreamedItem): item is StreamedItem & { query: string } {
  return item.type === 'web_search' && isString((item as { query?: unknown }).query);
}

/**
 * Create a fresh, empty `StreamResults` accumulator.
 *
 * @returns {StreamResults} A new results object with empty arrays and strings initialised.
 * @remarks
 * This helper avoids repeated boilerplate when starting a new stream.
 * @example
 * const results = toStreamResults();
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

export {
  isAgentMessage,
  isCommandExecution,
  isFileChangeArray,
  isFileChangeItem,
  isMcpToolCall,
  isString,
  isWebSearch,
  toStreamResults,
};
export type { FileChange, StreamResults };
