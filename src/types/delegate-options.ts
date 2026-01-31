/**
 * Options supported by the codex delegate CLI and runtime.
 *
 * @remarks
 * These options represent the union of CLI flags and runtime configuration used
 * by the delegate command.
 */
type DelegateOptions = {
  role: string;
  task: string;
  instructions: string;
  model?: string;
  reasoning?: string;
  workingDir?: string;
  sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access';
  approval?: 'never' | 'on-request' | 'on-failure' | 'untrusted';
  network?: boolean;
  webSearch?: 'disabled' | 'cached' | 'live';
  verbose?: boolean;
  structured?: boolean;
  schemaFile?: string;
  logFile?: string;
  maxItems?: number;
  timeoutMinutes?: number;
  overrideWireApi?: boolean;
};

export type { DelegateOptions };
