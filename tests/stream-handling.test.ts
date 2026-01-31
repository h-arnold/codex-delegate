import type { StreamedEvent } from '@openai/codex-sdk';
/* eslint import/order: "off" */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  makeEventStream,
  neverYieldStream,
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
import { processStream, toStreamResults } from '../src/codex-delegate';

describe('Stream Handling and Event Processing', () => {
  let stdoutWrite: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutWrite.mockRestore();
  });

  it('STREAM-01: item.completed with agent_message sets finalResponse', async () => {
    const events: StreamedEvent[] = [
      { type: 'item.completed', item: { type: 'agent_message', text: 'OK' } },
    ];
    const opts: SmallOpts = {
      role: 'impl',
      task: 't',
      instructions: '',
      verbose: false,
      timeoutMinutes: 1,
    };
    const res = await processStream(makeEventStream(events), opts, undefined, 1000);
    expect(res.finalResponse).toBe('OK');
  });

  it('STREAM-02: item.completed with command_execution appends command', async () => {
    const events: StreamedEvent[] = [
      { type: 'item.completed', item: { type: 'command_execution', command: 'ls' } },
    ];
    const opts: SmallOpts = {
      role: 'impl',
      task: 't',
      instructions: '',
      verbose: false,
      timeoutMinutes: 1,
    };
    const res = await processStream(makeEventStream(events), opts, undefined, 1000);
    expect(res.commands).toEqual(['ls']);
  });

  it('STREAM-03: item.completed with file_change appends formatted files', async () => {
    const events: StreamedEvent[] = [
      {
        type: 'item.completed',
        item: { type: 'file_change', changes: [{ kind: 'modified', path: 'src/a.ts' }] },
      },
    ];
    const opts: SmallOpts = {
      role: 'impl',
      task: 't',
      instructions: '',
      verbose: false,
      timeoutMinutes: 1,
    };
    const res = await processStream(makeEventStream(events), opts, undefined, 1000);
    expect(res.fileChanges).toEqual(['modified: src/a.ts']);
  });

  it('STREAM-04: item.completed with mcp_tool_call appends server:tool', async () => {
    const events: StreamedEvent[] = [
      { type: 'item.completed', item: { type: 'mcp_tool_call', server: 's', tool: 't' } },
    ];
    const opts: SmallOpts = {
      role: 'impl',
      task: 't',
      instructions: '',
      verbose: false,
      timeoutMinutes: 1,
    };
    const res = await processStream(makeEventStream(events), opts, undefined, 1000);
    expect(res.toolCalls).toEqual(['s:t']);
  });

  it('STREAM-05: item.completed with web_search appends query', async () => {
    const events: StreamedEvent[] = [
      { type: 'item.completed', item: { type: 'web_search', query: 'query' } },
    ];
    const opts: SmallOpts = {
      role: 'impl',
      task: 't',
      instructions: '',
      verbose: false,
      timeoutMinutes: 1,
    };
    const res = await processStream(makeEventStream(events), opts, undefined, 1000);
    expect(res.webQueries).toEqual(['query']);
  });

  it('STREAM-06: turn.completed sets usage summary', async () => {
    const events: StreamedEvent[] = [
      { type: 'turn.completed', usage: { input_tokens: 3, output_tokens: 4 } },
    ];
    const opts: SmallOpts = {
      role: 'impl',
      task: 't',
      instructions: '',
      verbose: false,
      timeoutMinutes: 1,
    };
    const res = await processStream(makeEventStream(events), opts, undefined, 1000);
    expect(res.usageSummary).toMatch(/Usage: input 3, output 4/);
  });

  it('STREAM-07: turn.failed throws with the event error message', async () => {
    const events: StreamedEvent[] = [{ type: 'turn.failed', error: { message: 'failure' } }];
    const opts: SmallOpts = {
      role: 'impl',
      task: 't',
      instructions: '',
      verbose: false,
      timeoutMinutes: 1,
    };
    await expect(processStream(makeEventStream(events), opts, undefined, 1000)).rejects.toThrow(
      'failure',
    );
  });

  it('STREAM-08: error event throws with message', async () => {
    const events: StreamedEvent[] = [{ type: 'error', message: 'boom' }];
    const opts: SmallOpts = {
      role: 'impl',
      task: 't',
      instructions: '',
      verbose: false,
      timeoutMinutes: 1,
    };
    await expect(processStream(makeEventStream(events), opts, undefined, 1000)).rejects.toThrow(
      'boom',
    );
  });

  it('STREAM-09: stream reading respects timeout and rejects with timeout message', async () => {
    const opts: SmallOpts = {
      role: 'impl',
      task: 't',
      instructions: '',
      verbose: false,
      timeoutMinutes: 0.001,
    };
    const p = processStream(nonResolvingNextWithReturn(), opts, undefined, 0);
    // allow the scheduled timeout to run
    await Promise.resolve();
    await expect(p).rejects.toThrow(/timed out/);
  });

  it('STREAM-10: processStream writes raw events to logStream and verbose outputs', async () => {
    const events: StreamedEvent[] = [
      { type: 'item.completed', item: { type: 'agent_message', text: 'hi' } },
    ];
    const write = vi.fn();
    const logStream = { write };
    const opts: SmallOpts = {
      role: 'impl',
      task: 't',
      instructions: '',
      verbose: true,
      timeoutMinutes: 1,
    };
    const res = await processStream(makeEventStream(events), opts, logStream, 1000);
    expect(res.finalResponse).toBe('hi');
    expect(write).toHaveBeenCalled();
    expect(stdoutWrite).toHaveBeenCalled();
  });

  it('STREAM-11: iterator.return is called in finally, even on error', async () => {
    const flag = { called: false };
    const events: StreamedEvent[] = [{ type: 'turn.failed', error: { message: 'oops' } }];
    const opts: SmallOpts = {
      role: 'impl',
      task: 't',
      instructions: '',
      verbose: false,
      timeoutMinutes: 1,
    };
    await expect(
      processStream(withReturnFlag(events, flag), opts, undefined, 1000),
    ).rejects.toThrow('oops');
    expect(flag.called).toBe(true);
  });

  it('STREAM-12: processStream handles an immediately-ending stream (no events)', async () => {
    const opts: SmallOpts = {
      role: 'impl',
      task: 't',
      instructions: '',
      verbose: false,
      timeoutMinutes: 1,
    };
    const res = await processStream(emptyStream(), opts, undefined, 1000);
    expect(res).toEqual(toStreamResults());
  });

  it('STREAM-13: iterator.next throws -> processStream propagates error and calls iterator.return', async () => {
    const flag: { returned?: boolean } = {};
    const opts: SmallOpts = {
      role: 'impl',
      task: 't',
      instructions: '',
      verbose: false,
      timeoutMinutes: 1,
    };
    await expect(processStream(throwingNextStream(flag), opts, undefined, 1000)).rejects.toThrow(
      'sync-next-throw',
    );
    expect(flag.returned).toBe(true);

    const flag2: { returned?: boolean } = {};
    await expect(processStream(rejectingNextStream(flag2), opts, undefined, 1000)).rejects.toThrow(
      'async-next-throw',
    );
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
    const res = await processStream(makeEventStream(events), opts, undefined, 1000);
    expect(res).toEqual(toStreamResults());
  });
});
