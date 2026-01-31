import { listPromptRoles } from '../prompts/prompt-templates.js';

/**
 * Print the command-line usage information to stdout.
 *
 * @returns {void}
 * @remarks
 * This writes a multi-line help message describing supported CLI flags and exits control flow back to the caller.
 * Typically used in response to `--help` or invalid invocation patterns.
 * @example
 * printHelp();
 */
function printHelp(): void {
  console.info(
    [
      'Usage: codex-delegate [options]',
      '       codex-delegate init',
      '',
      'Options:',
      '  --role <role>             Role to use (default: implementation)',
      '  --task <task>             Short task description (required)',
      '  --instructions <text>     Additional instructions',
      '  --model <model>           Codex model to use',
      '  --reasoning <level>       Reasoning effort (minimal|low|medium|high|xhigh)',
      '  --working-dir <path>      Working directory for the agent',
      '  --sandbox <mode>          Sandbox mode (read-only|workspace-write|danger-full-access)',
      '  --approval <policy>       Approval policy (never|on-request|on-failure|untrusted)',
      '  --network <true|false>    Enable network access (default: true)',
      '  --web-search <mode>       Web search mode (disabled|cached|live)',
      '  --verbose <true|false>    Enable verbose logging',
      '  --structured <true|false> Emit structured JSON output',
      '  --schema-file <path>      Path to JSON schema file for structured output',
      '  --log-file <path>         Path to write a verbose event log',
      '  --max-items <n>           Limit number of items printed in summaries',
      '  --timeout-minutes <n>     Timeout in minutes (default: 10)',
      '  --list-roles              Print available prompt roles and exit',
      '  --help, -h                Show this help message',
      '',
      'Commands:',
      '  init                      Create the .codex config file if missing',
    ].join('\n'),
  );
}

/**
 * Handle flags that require immediate action and may terminate the process.
 *
 * @param {string} arg - The CLI token to evaluate (e.g. '--list-roles' or '--help').
 * @returns {void} This function does not return; it exits the process if an immediate flag is found.
 * @remarks
 * This helper is used during argument parsing to implement flags that should short-circuit normal execution (listing roles, printing help).
 * @example
 * handleImmediateFlag('--help');
 */
function handleImmediateFlag(arg: string): void {
  if (arg === '--list-roles') {
    const roles = listPromptRoles();
    if (roles.length === 0) {
      console.info('No roles available.');
    } else {
      console.info(`Available roles:\n${roles.join('\n')}`);
    }
    process.exit(0);
  }

  if (arg === '--help' || arg === '-h') {
    printHelp();
    process.exit(0);
  }
}

export { handleImmediateFlag, printHelp };
