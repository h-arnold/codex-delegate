import type { StreamedEvent } from './helpers';
/* eslint import/order: "off" */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  makeEventStream,
  emptyStream,
  withReturnFlag,
  throwingNextStream,
  rejectingNextStream,
  nonResolvingNextWithReturn,
} from './helpers';

type SmallOpts = {
  role: string;
  task: string;
  instructions: string;
  verbose?: boolean;
  timeoutMinutes?: number;
};

vi.mock('@openai/codex-sdk', (): { Codex: new () => unknown } => ({
  Codex: class {},
}));

let helpers: typeof import('../src/codex-delegate');

describe('Stream Handling and Event Processing', () => {
  let stdoutWrite: ReturnType<typeof vi.spyOn>;
  const baseOpts: SmallOpts = {
    role: 'impl',
    task: 't',
    instructions: '',
    verbose: false,
    timeoutMinutes: 1,
  };
  /**
   * Build stream handling options with optional overrides.
   *
   * @param {Partial<SmallOpts>} overrides - Optional overrides for base options.
   * @returns {SmallOpts} The merged options.
   */
  const createOpts = (overrides: Partial<SmallOpts> = {}): SmallOpts => ({
    ...baseOpts,
    ...overrides,
  });
  /**
   * Create an async iterable that yields events with per-event delays.
   *
   * @param {StreamedEvent[]} events - Events to emit in order.
   * @param {number[]} delaysMs - Delay in milliseconds before each event.
   * @returns {AsyncIterable<StreamedEvent>} An iterable yielding the events after the delays.
   */
  const makeTimedEventStream = (
    events: StreamedEvent[],
    delaysMs: number[],
  ): AsyncIterable<StreamedEvent> => {
    return (async function* (): AsyncIterable<StreamedEvent> {
      for (const [index, event] of events.entries()) {
        const delayMs = delaysMs[index] ?? 0;
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        yield event;
      }
    })();
  };
  /**
   * Count heartbeat messages written to stdout.
   *
   * @param {ReturnType<typeof vi.spyOn>} spy - The stdout write spy.
   * @returns {number} The number of heartbeat messages written.
   */
  const countHeartbeats = (spy: ReturnType<typeof vi.spyOn>): number =>
    spy.mock.calls.filter(([message]) => message === 'agent is still working\n').length;

  beforeEach(async () => {
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    helpers = await import('../src/codex-delegate');
  });

  afterEach(() => {
    stdoutWrite.mockRestore();
  });

  it('STREAM-01: item.completed with agent_message sets finalResponse', async () => {
    const events: StreamedEvent[] = [
      { type: 'item.completed', item: { type: 'agent_message', text: 'OK' } },
    ];
    const res = await helpers.processStream(makeEventStream(events), createOpts(), undefined, 1000);
    expect(res.finalResponse).toBe('OK');
  });

  it('STREAM-02: item.completed with command_execution appends command', async () => {
    const events: StreamedEvent[] = [
      { type: 'item.completed', item: { type: 'command_execution', command: 'ls' } },
    ];
    const res = await helpers.processStream(makeEventStream(events), createOpts(), undefined, 1000);
    expect(res.commands).toEqual(['ls']);
  });

  it('STREAM-03: item.completed with file_change appends formatted files', async () => {
    const events: StreamedEvent[] = [
      {
        type: 'item.completed',
        item: { type: 'file_change', changes: [{ kind: 'modified', path: 'src/a.ts' }] },
      },
    ];
    const res = await helpers.processStream(makeEventStream(events), createOpts(), undefined, 1000);
    expect(res.fileChanges).toEqual(['modified: src/a.ts']);
  });

  it('STREAM-04: item.completed with mcp_tool_call appends server:tool', async () => {
    const events: StreamedEvent[] = [
      { type: 'item.completed', item: { type: 'mcp_tool_call', server: 's', tool: 't' } },
    ];
    const res = await helpers.processStream(makeEventStream(events), createOpts(), undefined, 1000);
    expect(res.toolCalls).toEqual(['s:t']);
  });

  it('STREAM-05: item.completed with web_search appends query', async () => {
    const events: StreamedEvent[] = [
      { type: 'item.completed', item: { type: 'web_search', query: 'query' } },
    ];
    const res = await helpers.processStream(makeEventStream(events), createOpts(), undefined, 1000);
    expect(res.webQueries).toEqual(['query']);
  });

  it('STREAM-05B: command_execution emits a streamed stdout update', async () => {
    const events: StreamedEvent[] = [
      { type: 'item.completed', item: { type: 'command_execution', command: 'echo hi' } },
    ];
    await helpers.processStream(makeEventStream(events), createOpts(), undefined, 1000);
    expect(stdoutWrite).toHaveBeenCalledWith(expect.stringContaining('Command executed: echo hi'));
  });

  it('STREAM-05C: file_change emits streamed stdout updates', async () => {
    const events: StreamedEvent[] = [
      {
        type: 'item.completed',
        item: {
          type: 'file_change',
          changes: [
            { kind: 'update', path: 'src/file.ts' },
            { kind: 'add', path: 'src/extra.ts' },
          ],
        },
      },
    ];
    await helpers.processStream(makeEventStream(events), createOpts(), undefined, 1000);
    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining('File change: update: src/file.ts'),
    );
    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining('File change: add: src/extra.ts'),
    );
  });

  it('STREAM-05D: mcp_tool_call emits a streamed stdout update', async () => {
    const events: StreamedEvent[] = [
      { type: 'item.completed', item: { type: 'mcp_tool_call', server: 'a', tool: 'b' } },
    ];
    await helpers.processStream(makeEventStream(events), createOpts(), undefined, 1000);
    expect(stdoutWrite).toHaveBeenCalledWith(expect.stringContaining('Tool call: a:b'));
  });

  it('STREAM-05E: web_search emits a streamed stdout update', async () => {
    const events: StreamedEvent[] = [
      { type: 'item.completed', item: { type: 'web_search', query: 'fast query' } },
    ];
    await helpers.processStream(makeEventStream(events), createOpts(), undefined, 1000);
    expect(stdoutWrite).toHaveBeenCalledWith(expect.stringContaining('Web search: fast query'));
  });

  it('STREAM-06: turn.completed sets usage summary', async () => {
    const events: StreamedEvent[] = [
      { type: 'turn.completed', usage: { input_tokens: 3, output_tokens: 4 } },
    ];
    const res = await helpers.processStream(makeEventStream(events), createOpts(), undefined, 1000);
    expect(res.usageSummary).toMatch(/Usage: input 3, output 4/);
  });

  it('STREAM-07: turn.failed throws with the event error message', async () => {
    const events: StreamedEvent[] = [{ type: 'turn.failed', error: { message: 'failure' } }];
    await expect(
      helpers.processStream(makeEventStream(events), createOpts(), undefined, 1000),
    ).rejects.toThrow('failure');
  });

  it('STREAM-08: error event throws with message', async () => {
    const events: StreamedEvent[] = [{ type: 'error', message: 'boom' }];
    await expect(
      helpers.processStream(makeEventStream(events), createOpts(), undefined, 1000),
    ).rejects.toThrow('boom');
  });

  it('STREAM-09: stream reading respects timeout and rejects with timeout message', async () => {
    const p = helpers.processStream(
      nonResolvingNextWithReturn(),
      createOpts({ timeoutMinutes: 0.001 }),
      undefined,
      0,
    );
    // allow the scheduled timeout to run
    await Promise.resolve();
    await expect(p).rejects.toThrow(/timed out/);
  });

  it('STREAM-10: processStream writes raw events to logStream and verbose outputs', async () => {
    const events: StreamedEvent[] = [
      { type: 'item.completed', item: { type: 'agent_message', text: 'hi' } },
    ];
    const write = vi.fn();
    const logStream = { write } as unknown as ReturnType<typeof import('fs').createWriteStream>;
    const res = await helpers.processStream(
      makeEventStream(events),
      createOpts({ verbose: true }),
      logStream,
      1000,
    );
    expect(res.finalResponse).toBe('hi');
    expect(write).toHaveBeenCalled();
    expect(stdoutWrite).toHaveBeenCalled();
  });

  it('STREAM-11: iterator.return is called in finally, even on error', async () => {
    const flag = { called: false };
    const events: StreamedEvent[] = [{ type: 'turn.failed', error: { message: 'oops' } }];
    await expect(
      helpers.processStream(withReturnFlag(events, flag), createOpts(), undefined, 1000),
    ).rejects.toThrow('oops');
    expect(flag.called).toBe(true);
  });

  it('STREAM-12: processStream handles an immediately-ending stream (no events)', async () => {
    const res = await helpers.processStream(emptyStream(), createOpts(), undefined, 1000);
    expect(res).toEqual(helpers.toStreamResults());
  });

  it('STREAM-13: iterator.next throws -> processStream propagates error and calls iterator.return', async () => {
    const flag: { returned?: boolean } = {};
    await expect(
      helpers.processStream(throwingNextStream(flag), createOpts(), undefined, 1000),
    ).rejects.toThrow('sync-next-throw');
    expect(flag.returned).toBe(true);

    const flag2: { returned?: boolean } = {};
    await expect(
      helpers.processStream(rejectingNextStream(flag2), createOpts(), undefined, 1000),
    ).rejects.toThrow('async-next-throw');
    expect(flag2.returned).toBe(true);
  });

  it('STREAM-14: handleItemCompleted ignores unknown item types (no mutation)', async () => {
    const events: StreamedEvent[] = [
      { type: 'item.completed', item: { type: 'unknown', foo: 'bar' } },
    ];
    const opts: SmallOpts = {
      role: 'impl',
      task: 't',
      instructions: '',
      verbose: false,
      timeoutMinutes: 1,
    };
    const res = await helpers.processStream(makeEventStream(events), opts, undefined, 1000);
    expect(res).toEqual(helpers.toStreamResults());
  });

  it('STREAM-15: emits heartbeat after 60s of inactivity', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    stdoutWrite.mockClear();

    try {
      const events: StreamedEvent[] = [
        { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 2 } },
      ];
      const stream = makeEventStream(events, 61000);
      const promise = helpers.processStream(stream, createOpts(), undefined, 200000);

      await vi.advanceTimersByTimeAsync(59000);
      expect(countHeartbeats(stdoutWrite)).toBe(0);

      await vi.advanceTimersByTimeAsync(1000);
      expect(countHeartbeats(stdoutWrite)).toBe(1);

      await vi.advanceTimersByTimeAsync(1000);
      await promise;
      await vi.advanceTimersByTimeAsync(60000);
      expect(countHeartbeats(stdoutWrite)).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('STREAM-16: does not emit heartbeat when activity occurs within 60s', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    stdoutWrite.mockClear();

    try {
      const events: StreamedEvent[] = [
        { type: 'item.completed', item: { type: 'agent_message', text: 'first' } },
        { type: 'item.completed', item: { type: 'agent_message', text: 'second' } },
      ];
      const stream = makeTimedEventStream(events, [30000, 100000]);
      const promise = helpers.processStream(stream, createOpts(), undefined, 200000);

      await vi.advanceTimersByTimeAsync(30000);
      await Promise.resolve();

      await vi.advanceTimersByTimeAsync(30000);
      expect(countHeartbeats(stdoutWrite)).toBe(0);

      await vi.advanceTimersByTimeAsync(60000);
      expect(countHeartbeats(stdoutWrite)).toBe(1);

      await vi.advanceTimersByTimeAsync(10000);
      await promise;
    } finally {
      vi.useRealTimers();
    }
  });

  it('STREAM-17: clears heartbeat interval after error', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    stdoutWrite.mockClear();

    try {
      const events: StreamedEvent[] = [{ type: 'turn.failed', error: { message: 'boom' } }];
      const promise = helpers.processStream(
        makeEventStream(events, 1000),
        createOpts(),
        undefined,
        200000,
      );
      const rejection = expect(promise).rejects.toThrow('boom');

      await vi.advanceTimersByTimeAsync(1000);
      await rejection;

      await vi.advanceTimersByTimeAsync(60000);
      expect(countHeartbeats(stdoutWrite)).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
