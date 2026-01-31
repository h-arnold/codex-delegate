import type { DelegateOptions } from '../types/delegate-options.js';

/**
 * Default values for all delegate CLI options.
 *
 * @remarks
 * These defaults are shared between CLI parsing and config initialisation.
 */
const DEFAULT_OPTIONS: DelegateOptions = {
  role: 'implementation',
  task: '',
  instructions: '',
  sandbox: 'danger-full-access',
  approval: 'never',
  network: true,
  webSearch: 'live',
  verbose: false,
  timeoutMinutes: 10,
};

export { DEFAULT_OPTIONS };
