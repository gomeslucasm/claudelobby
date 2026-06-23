# claudebar

A multi-line status bar for [Claude Code](https://claude.com/claude-code). It composes several **widgets** into the status line at the bottom of your terminal — news headlines, football scores, the live World Cup scoreboard — and can swap what's shown based on the time of day.

It plugs into Claude Code's `statusLine` hook, so it shows up automatically while you work. If you already use a status line tool (like `ccstatusline`), claudebar can keep it running as one of its lines.

```
🔴 LIVE 17' | Portugal (C. Ronaldo 6') 1 x 0 Uzbekistan          (8s)
HN: Show HN: I built a … | TechCrunch: OpenAI announces …        (4s)
~/project  main ✱  ⎇  claude-opus-4-8                             (1s)
```

## Requirements

- **Node.js 18+** (developed on Node 22)
- **Claude Code** installed, with a `~/.claude/settings.json` (created automatically the first time you run Claude Code)

## Install

claudebar isn't on npm yet — install it from source:

```bash
git clone https://github.com/gomeslucasm/claudebar.git
cd claudebar
npm install
npm run build
npm link        # makes the `claudebar` command available globally
```

`npm link` exposes the `claudebar` binary on your `PATH`. (If you'd rather not link, you can call `node /path/to/claudebar/dist/cli/index.js` instead.)

## Quick start

```bash
claudebar init
```

The interactive setup walks you through:

1. **Language** — English or Portuguese (BR).
2. **Lines** — how many status-bar lines you want, and what goes in each.
3. **Schedules** (optional) — time windows where specific lines change (e.g. show football in the evening, news during work hours).
4. **Hook up Claude Code** — at the end it offers to write the `statusLine` entry into `~/.claude/settings.json` for you. Say yes and you're done.

Start (or restart) Claude Code and the bar appears.

If claudebar detects an existing status line tool in your settings, it offers to keep it as one of the lines, so you don't lose what you already had.

## Widgets

Each line is one or more widgets that **cycle** — every few seconds the line rotates to the next item.

| Widget        | What it shows                                                                 |
|---------------|-------------------------------------------------------------------------------|
| **worldcup**  | Live FIFA World Cup scoreboard — live/finished/upcoming matches, with scorers next to each team (`Portugal (Ronaldo 6') 1 x 0 Uzbekistan`). Data from ESPN. |
| **news**      | Headlines from RSS sources. Built-in: `G1`, `Folha`, `UOL`, `HN`, `TechCrunch`, `Ars`, `Verge`. |
| **soccer**    | Football news headlines. Built-in: `GloboEsporte`, `ESPN-soccer`, `BBC-sport`, `UOL-esporte`. |
| **passthrough** | Runs any command and shows its output verbatim — use this to wrap `ccstatusline` or your own script. Always solo (can't share a line). |

Content widgets (`news`, `soccer`, `worldcup`) can be combined on a single line and they'll rotate together. `passthrough` always takes a line to itself.

You pick the **seconds per item** per widget during setup (5–30s).

## Schedules

A schedule is a time window (e.g. `18:00 → 23:00`) where some lines differ from the default. Only the lines you change are overridden — everything else stays as your default. Windows that wrap past midnight (e.g. `23:00 → 06:00`) work as expected.

Example: keep your normal status line during work hours, then switch line 2 to the World Cup scoreboard in the evening.

## Configuration

Config lives at `~/.claudebar/config.json`. Re-run `claudebar init` to rebuild it interactively, or edit the JSON directly. Shape:

```jsonc
{
  "lang": "en",
  "default": {
    "lines": [
      [{ "widget": "passthrough", "command": "npx -y ccstatusline@latest" }],
      [{ "widget": "news", "sources": ["HN", "TechCrunch"], "interval": 10 }],
      [{ "widget": "worldcup", "interval": 8 }]
    ]
  },
  "schedules": [
    {
      "name": "evening",
      "from": "18:00",
      "to": "23:00",
      "overrides": {
        "1": [{ "widget": "soccer", "sources": ["GloboEsporte"], "interval": 10 }]
      }
    }
  ]
}
```

- `lines` — an array of lines; each line is an array of widgets.
- `overrides` — keyed by line index (as a string), sparse: only the lines that change.
- `interval` — seconds each item stays before the line rotates.

Cached network data (news/scores) is stored under `~/.claudebar/cache/` with short TTLs, so the bar stays snappy and doesn't hammer upstream APIs.

## Commands

```bash
claudebar init    # interactive setup
claudebar run     # render the lines once (this is what Claude Code calls)
```

`claudebar run` is what the `statusLine` hook invokes on each refresh — you normally don't run it by hand.

## How it connects to Claude Code

`claudebar init` adds this to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "claudebar run",
    "padding": 0,
    "refreshInterval": 1000
  }
}
```

Claude Code calls `claudebar run` on each refresh and renders whatever it prints. To remove claudebar, delete that `statusLine` block (or point it back at your previous tool).

## Development

See [DEVELOPMENT.md](./DEVELOPMENT.md) for building from source, project layout, and how to add a widget.

## License

MIT
