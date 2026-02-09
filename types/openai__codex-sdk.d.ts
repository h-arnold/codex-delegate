declare module '@openai/codex-sdk' {
  export interface FileChange {
    kind: string;
    path: string;
  }

  export interface AgentMessageItem {
    type: 'agent_message';
    text?: string;
  }

  export interface CommandExecutionItem {
    type: 'command_execution';
    command?: string;
  }

  export interface FileChangeItem {
    type: 'file_change';
    changes: FileChange[];
  }

  export interface McpToolCallItem {
    type: 'mcp_tool_call';
    server: string;
    tool: string;
  }

  export interface WebSearchItem {
    type: 'web_search';
    query: string;
  }

  export type ThreadItem =
    | AgentMessageItem
    | CommandExecutionItem
    | FileChangeItem
    | McpToolCallItem
    | WebSearchItem;

  export interface ItemCompletedEvent {
    type: 'item.completed';
    item: ThreadItem;
  }

  export interface TurnCompletedEvent {
    type: 'turn.completed';
    usage?: { input_tokens: number; output_tokens: number };
  }

  export interface TurnFailedEvent {
    type: 'turn.failed';
    error?: { message: string };
  }

  export interface StreamErrorEvent {
    type: 'error';
    message?: string;
  }

  export type ThreadEvent =
    | ItemCompletedEvent
    | TurnCompletedEvent
    | TurnFailedEvent
    | StreamErrorEvent;

  export interface ThreadRunOptions {
    outputSchema?: Record<string, unknown>;
  }

  export interface ThreadRunResult {
    events: AsyncIterable<ThreadEvent>;
  }

  export interface CodexThread {
    runStreamed(prompt: string, options?: ThreadRunOptions): Promise<ThreadRunResult>;
  }

  export interface CodexOptions {
    config?: { wire_api: 'responses' };
    env?: Record<string, string>;
  }

  export class Codex {
    constructor(options?: CodexOptions);
    startThread(options?: Record<string, unknown>): CodexThread;
  }
}
