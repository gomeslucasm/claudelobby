import { loadClaudeSettings } from '../config.js';

export interface DetectedTool {
  name: string;
  command: string;
}

export function detectExistingStatusLine(): DetectedTool | null {
  const settings = loadClaudeSettings();
  const sl = settings.statusLine as Record<string, unknown> | undefined;
  if (!sl?.command) return null;

  const cmd = sl.command as string;
  if (cmd.includes('claudebar')) return null; // already us

  const name = cmd.includes('ccstatusline') ? 'ccstatusline'
    : cmd.includes('npx') ? 'npx tool'
    : 'custom command';

  return { name, command: cmd };
}
