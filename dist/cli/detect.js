import { loadClaudeSettings } from '../config.js';
export function detectExistingStatusLine() {
    const settings = loadClaudeSettings();
    const sl = settings.statusLine;
    if (!sl?.command)
        return null;
    const cmd = sl.command;
    if (cmd.includes('claudelobby'))
        return null; // already us
    const name = cmd.includes('ccstatusline') ? 'ccstatusline'
        : cmd.includes('npx') ? 'npx tool'
            : 'custom command';
    return { name, command: cmd };
}
