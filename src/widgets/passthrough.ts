import { execSync } from 'child_process';
import type { PassthroughWidget } from '../types.js';

// `stdin` is the JSON payload Claude Code pipes to the status line command.
// Tools like ccstatusline read it for context/cost/git info, so we forward it.
export function runPassthrough(config: PassthroughWidget, stdin = ''): string {
  try {
    return execSync(config.command, {
      timeout: 10000,
      input: stdin,
      stdio: ['pipe', 'pipe', 'ignore'],
    }).toString().trim();
  } catch {
    return '';
  }
}
