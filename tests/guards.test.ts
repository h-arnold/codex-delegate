import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { StreamedItem } from './helpers';

vi.mock('@openai/codex-sdk', (): { Codex: new () => unknown } => ({
  Codex: class {
    /**
     * Return a mock `startThread` implementation.
     * @returns An object exposing a `runStreamed` method.
     */
    startThread(): {
      runStreamed: () => Promise<{ events: AsyncGenerator<never, void, unknown> }>;
    } {
      return {
        /**
         * Return a promise resolving to an async generator that yields nothing.
         * @returns Promise resolving to an object with `events` async generator.
         */
        runStreamed: async function (): Promise<{ events: AsyncGenerator<never, void, unknown> }> {
          return { events: (async function* (): AsyncGenerator<never, void, unknown> {})() };
        },
      };
    }
  },
}));

let helpers: typeof import('../src/codex-delegate');
beforeEach(async () => {
  helpers = await import('../src/codex-delegate');
});

describe('Streaming Guards & Handlers', () => {
  describe('GUARD-01: isAgentMessage', () => {
    it('returns true for agent_message with text string', () => {
      const item = { type: 'agent_message', text: 'hello' } as unknown as StreamedItem;
      expect(helpers.isAgentMessage(item)).toBe(true);
    });

    it('returns false for agent_message with missing or non-string text', () => {
      expect(helpers.isAgentMessage({ type: 'agent_message' } as unknown as StreamedItem)).toBe(
        false,
      );
      expect(
        helpers.isAgentMessage({ type: 'agent_message', text: 123 } as unknown as StreamedItem),
      ).toBe(false);
    });

    it('returns false for other types even if text present', () => {
      expect(
        helpers.isAgentMessage({ type: 'web_search', text: 'x' } as unknown as StreamedItem),
      ).toBe(false);
      expect(helpers.isAgentMessage({} as unknown as StreamedItem)).toBe(false);
    });
  });

  describe('GUARD-02: isCommandExecution', () => {
    it('returns true for command_execution with command string', () => {
      expect(
        helpers.isCommandExecution({
          type: 'command_execution',
          command: 'ls',
        } as unknown as StreamedItem),
      ).toBe(true);
    });

    it('returns false for missing or non-string command', () => {
      expect(
        helpers.isCommandExecution({ type: 'command_execution' } as unknown as StreamedItem),
      ).toBe(false);
      expect(
        helpers.isCommandExecution({
          type: 'command_execution',
          command: 5,
        } as unknown as StreamedItem),
      ).toBe(false);
      expect(helpers.isCommandExecution({} as unknown as StreamedItem)).toBe(false);
    });
  });

  describe('GUARD-03: isFileChangeArray', () => {
    it('validates well-formed file change arrays', () => {
      expect(helpers.isFileChangeArray([{ kind: 'modified', path: 'src/index.ts' }])).toBe(true);
    });

    it('accepts empty arrays (edge case)', () => {
      expect(helpers.isFileChangeArray([])).toBe(true);
    });

    it('rejects non-arrays and malformed entries', () => {
      expect(helpers.isFileChangeArray(null)).toBe(false);
      expect(helpers.isFileChangeArray([{ kind: 'a' }])).toBe(false);
      expect(helpers.isFileChangeArray([null as unknown])).toBe(false);
      expect(helpers.isFileChangeArray([{ kind: 'a', path: 123 as unknown }])).toBe(false);
    });
  });

  describe('GUARD-04: isFileChangeItem', () => {
    it('returns true when type is file_change and changes validate', () => {
      const item = {
        type: 'file_change',
        changes: [{ kind: 'added', path: 'foo.txt' }],
      } as unknown as StreamedItem;
      expect(helpers.isFileChangeItem(item)).toBe(true);
    });

    it('accepts empty changes arrays (edge case)', () => {
      expect(
        helpers.isFileChangeItem({ type: 'file_change', changes: [] } as unknown as StreamedItem),
      ).toBe(true);
    });

    it('returns false for wrong type or malformed changes', () => {
      expect(helpers.isFileChangeItem({ type: 'file_change' } as unknown as StreamedItem)).toBe(
        false,
      );
      expect(
        helpers.isFileChangeItem({
          type: 'file_change',
          changes: [{ path: 'a' }],
        } as unknown as StreamedItem),
      ).toBe(false);
      expect(
        helpers.isFileChangeItem({
          type: 'agent_message',
          changes: [{ kind: 'a', path: 'b' }],
        } as unknown as StreamedItem),
      ).toBe(false);
    });
  });

  describe('GUARD-05: isMcpToolCall', () => {
    it('returns true only when server and tool strings present', () => {
      expect(
        helpers.isMcpToolCall({
          type: 'mcp_tool_call',
          server: 's',
          tool: 't',
        } as unknown as StreamedItem),
      ).toBe(true);
      expect(
        helpers.isMcpToolCall({
          type: 'mcp_tool_call',
          server: '',
          tool: '',
        } as unknown as StreamedItem),
      ).toBe(true);
    });

    it('returns false when missing or non-string server/tool', () => {
      expect(
        helpers.isMcpToolCall({ type: 'mcp_tool_call', server: 's' } as unknown as StreamedItem),
      ).toBe(false);
      expect(
        helpers.isMcpToolCall({
          type: 'mcp_tool_call',
          server: 1,
          tool: 't',
        } as unknown as StreamedItem),
      ).toBe(false);
      expect(helpers.isMcpToolCall({} as unknown as StreamedItem)).toBe(false);
    });
  });

  describe('GUARD-06: isWebSearch', () => {
    it('returns true for web_search with query string', () => {
      expect(
        helpers.isWebSearch({ type: 'web_search', query: 'find me' } as unknown as StreamedItem),
      ).toBe(true);
      expect(
        helpers.isWebSearch({ type: 'web_search', query: '' } as unknown as StreamedItem),
      ).toBe(true);
    });

    it('returns false for missing or non-string query', () => {
      expect(helpers.isWebSearch({ type: 'web_search' } as unknown as StreamedItem)).toBe(false);
      expect(helpers.isWebSearch({ type: 'web_search', query: 5 } as unknown as StreamedItem)).toBe(
        false,
      );
      expect(helpers.isWebSearch({} as unknown as StreamedItem)).toBe(false);
    });
  });
});
