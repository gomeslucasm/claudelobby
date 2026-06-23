# Development

Notes for hacking on claudebar itself. For usage, see [README.md](./README.md).

## Setup

```bash
npm install
npm run build      # tsc -> dist/
npm run dev        # run the CLI from TS sources via ts-node
```

`npm run dev` runs `src/cli/index.ts` directly. Pass a subcommand, e.g. `npm run dev -- run`.

## Project layout

```
src/
  cli/
    index.ts      # entry point + command dispatch (init | run)
    init.ts       # interactive setup wizard (@clack/prompts)
    detect.ts     # detects an existing statusLine tool to wrap
  widgets/
    worldcup.ts   # FIFA World Cup scoreboard (ESPN)
    news.ts       # RSS headlines
    soccer.ts     # football news (RSS)
    passthrough.ts# runs an arbitrary command, output verbatim
    cache.ts      # tiny file cache with TTL (~/.claudebar/cache)
    shorten.ts    # text-shortening helpers
    rss.ts        # minimal RSS fetch/parse
  runner.ts       # resolves active lines, runs widgets, prints output
  config.ts       # config load/save + schedule resolution
  types.ts        # config + widget types
  i18n.ts         # en / pt-BR strings
```

## How a render works

1. Claude Code calls `claudebar run` and pipes a JSON payload on stdin.
2. `runner.run()` loads `~/.claudebar/config.json` and calls `resolveLines()`, which applies any active time-based schedule over the default lines.
3. Each line's widgets are fetched in parallel; their items are flattened and the current one is picked from a time-based index (so the bar rotates without keeping state).
4. `passthrough` lines are special: their command runs with the stdin payload forwarded, and the output is printed verbatim (so tools like `ccstatusline` work unchanged).

## Adding a widget

1. Add the widget's config shape to `src/types.ts` and include it in the `WidgetConfig` union.
2. Create `src/widgets/<name>.ts` exporting `getItems(config, lang?): Promise<string[]>`. Each returned string is one rotation item.
3. Wire it into the `switch` in `src/runner.ts` (`widgetItems`).
4. Add it to the setup wizard in `src/cli/init.ts` (`WidgetType`, `configureWidget`, and the content-widget options).
5. Add any user-facing strings to `src/i18n.ts` for both `en` and `pt`.

If the widget hits the network, cache responses via `src/widgets/cache.ts` (`loadCache`/`saveCache`) with a sensible TTL — the bar refreshes roughly once a second, so uncached fetches would be abusive.

## Caches & config locations

- Config: `~/.claudebar/config.json`
- Cache: `~/.claudebar/cache/*.json`
- Claude Code settings touched: `~/.claude/settings.json` (`statusLine` block only)

## Type-checking

```bash
npx tsc --noEmit
```

The codebase uses `noImplicitAny`. ESPN/RSS payloads are untyped, so parsing code annotates the loosely-typed boundaries with `any` and local `eslint-disable` comments — keep that confined to the parse layer.
