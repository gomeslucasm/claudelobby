import { loadConfig, resolveLines } from './config.js';
import { runPassthrough } from './widgets/passthrough.js';
import { getItems as getNewsItems } from './widgets/news.js';
import { getItems as getSoccerItems } from './widgets/soccer.js';
import { getItems as getWorldCupItems } from './widgets/worldcup.js';
const DEFAULT_INTERVAL = 10;
async function widgetItems(widget, lang) {
    switch (widget.widget) {
        case 'news': return getNewsItems(widget);
        case 'soccer': return getSoccerItems(widget);
        case 'worldcup': return getWorldCupItems(widget, lang);
        case 'passthrough': return [];
    }
}
async function runLine(line, lang, stdin) {
    if (!line.length)
        return '';
    // Passthrough is always solo — output is opaque, can't cycle with others
    if (line[0].widget === 'passthrough') {
        return runPassthrough(line[0], stdin);
    }
    // Collect all items from all widgets in parallel
    const allItems = (await Promise.all(line.map(w => widgetItems(w, lang)))).flat().filter(Boolean);
    if (!allItems.length)
        return '';
    const interval = line[0].interval ?? DEFAULT_INTERVAL;
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
async function readStdin() {
    if (process.stdin.isTTY)
        return '';
    try {
        const chunks = [];
        for await (const chunk of process.stdin)
            chunks.push(chunk);
        return Buffer.concat(chunks).toString('utf8');
    }
    catch {
        return '';
    }
}
export async function run() {
    const config = loadConfig();
    if (!config) {
        console.log('claudelobby: not configured. Run: claudelobby init');
        return;
    }
    const stdin = await readStdin();
    const lang = config.lang ?? 'en';
    const lines = resolveLines(config);
    const output = await Promise.all(lines.map(l => runLine(l, lang, stdin)));
    console.log(output.filter(Boolean).join('\n'));
}
