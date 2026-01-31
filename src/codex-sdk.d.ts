declare module '@openai/codex-sdk' {
  export type ModelReasoningEffort =
    | 'minimal'
    | 'low'
    | 'medium'
    | 'high'
    | 'xhigh';

  export interface AgentMessage {
    type: 'agent_message';
    text: string;
  }

  export interface CommandExecution {
    type: 'command_execution';
    command: string;
  }

  export interface FileChange {
    type: 'file_change';
    changes: Array<{ kind: string; path: string }>;
  }

  export interface MCPToolCall {
    type: 'mcp_tool_call';
    server: string;
    tool: string;
  }

  export interface WebSearch {
    type: 'web_search';
    query: string;
  }

  export type StreamedItem =
    | AgentMessage
    | CommandExecution
    | FileChange
    | MCPToolCall
    | WebSearch
    | { type: string; [key: string]: unknown };

  export interface StreamedEvent {
    type: string;
    item?: StreamedItem;
    usage?: { input_tokens: number; output_tokens: number };
    error?: { message: string };
    message?: string;
  }

  export interface RunStreamedOptions {
    outputSchema?: Record<string, unknown>;
  }

  export interface Thread {
    runStreamed(
      prompt: string,
      opts?: RunStreamedOptions,
    ): Promise<{ events: AsyncIterable<StreamedEvent> }>;
  }

  export class Codex {
    constructor();
    startThread(opts?: {
      model?: string;
      modelReasoningEffort?: ModelReasoningEffort | undefined;
      workingDirectory?: string;
      sandboxMode?: string;
      approvalPolicy?: string;
      networkAccessEnabled?: boolean;
      webSearchMode?: string;
    }): Thread;
  }

  export default Codex;
}
