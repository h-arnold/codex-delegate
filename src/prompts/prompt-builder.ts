import { resolvePromptTemplate } from './prompt-templates.js';
import type { DelegateOptions } from '../types/delegate-options.js';

/**
 * Build the full prompt text to send to the Codex thread based on resolved template and CLI options.
 *
 * @param {DelegateOptions} options - Parsed invocation options that control role, task and instructions.
 * @returns {string} The composed prompt text, consisting of the role template and optional Instructions/Task sections.
 * @remarks
 * Empty sections are omitted to avoid extra whitespace in the final prompt.
 * @example
 * buildPrompt({ role: 'implementation', task: 'Add tests', instructions: 'Focus on unit tests' });
 */
function buildPrompt(options: DelegateOptions): string {
  const template = resolvePromptTemplate(options.role);
  const sections = [
    template,
    options.instructions ? `Instructions:\n${options.instructions}` : '',
    options.task ? `Task:\n${options.task}` : '',
  ].filter((section) => section.length > 0);

  return sections.join('\n\n');
}

export { buildPrompt };
