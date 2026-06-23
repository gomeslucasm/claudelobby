import { loadConfig, resolveLines } from './config.js';
import { runPassthrough } from './widgets/passthrough.js';
import { getItems as getNewsItems } from './widgets/news.js';
import { getItems as getSoccerItems } from './widgets/soccer.js';
import { getItems as getWorldCupItems } from './widgets/worldcup.js';
import type { WidgetConfig, LineConfig, Lang } from './types.js';

const DEFAULT_INTERVAL = 10;

async function widgetItems(widget: WidgetConfig, lang: Lang): Promise<string[]> {
  switch (widget.widget) {
    case 'news':     return getNewsItems(widget);
    case 'soccer':   return getSoccerItems(widget);
    case 'worldcup': return getWorldCupItems(widget, lang);
    case 'passthrough': return [];
  }
}

async function runLine(line: LineConfig, lang: Lang, stdin: string): Promise<string> {
  if (!line.length) return '';

  // Passthrough is always solo — output is opaque, can't cycle with others
  if (line[0].widget === 'passthrough') {
    return runPassthrough(line[0], stdin);
  }

  // Collect all items from all widgets in parallel
  const allItems = (await Promise.all(line.map(w => widgetItems(w, lang)))).flat().filter(Boolean);
  if (!allItems.length) return '';

  const interval = (line[0] as { interval?: number }).interval ?? DEFAULT_INTERVAL;
  const now = Date.now() / 1000;
  const idx = Math.floor(now / interval) % allItems.length;
  const secondsLeft = interval - Math.floor(now % interval);

  const item = allItems[idx];
  const suffix = ` (${secondsLeft}s)`;
  const maxLen = 200 - suffix.length;
  return (item.length > maxLen ? item.slice(0, maxLen - 1) + '…' : item) + suffix;
}

// Claude Code pipes a JSON payload to the status line command on stdin.
// Read it (without blocking on a TTY) so passthrough widgets can reuse it.
async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString('utf8');
  } catch {
    return '';
  }
}

export async function run(): Promise<void> {
  const config = loadConfig();
  if (!config) {
    console.log('claudebar: not configured. Run: claudebar init');
    return;
  }

  const stdin = await readStdin();
  const lang = config.lang ?? 'en';
  const lines = resolveLines(config);
  const output = await Promise.all(lines.map(l => runLine(l, lang, stdin)));
  console.log(output.filter(Boolean).join('\n'));
}
