import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { ClaudebarConfig, LineConfig } from './types.js';

export const CONFIG_DIR = join(homedir(), '.claudebar');
export const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
export const CLAUDE_SETTINGS = join(homedir(), '.claude', 'settings.json');
export const CACHE_DIR = join(CONFIG_DIR, 'cache');

export function configExists(): boolean {
  return existsSync(CONFIG_FILE);
}

export function loadConfig(): ClaudebarConfig | null {
  if (!existsSync(CONFIG_FILE)) return null;
  return JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) as ClaudebarConfig;
}

export function saveConfig(config: ClaudebarConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function loadClaudeSettings(): Record<string, unknown> {
  if (!existsSync(CLAUDE_SETTINGS)) return {};
  return JSON.parse(readFileSync(CLAUDE_SETTINGS, 'utf8'));
}

export function saveClaudeSettings(settings: Record<string, unknown>): void {
  writeFileSync(CLAUDE_SETTINGS, JSON.stringify(settings, null, 2));
}

// Merges default lines with schedule overrides.
export function resolveLines(config: ClaudebarConfig): LineConfig[] {
  const base = config.default.lines;
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();

  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };

  for (const schedule of config.schedules ?? []) {
    const from = toMin(schedule.from);
    const to = toMin(schedule.to);
    const active = from <= to
      ? cur >= from && cur < to
      : cur >= from || cur < to;

    if (active) {
      return base.map((line, i) => schedule.overrides?.[String(i)] ?? line);
    }
  }

  return base;
}
