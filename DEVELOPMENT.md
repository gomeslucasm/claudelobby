# Development

Notes for hacking on claudelobby itself. For usage, see [README.md](./README.md).

## Setup

```bash
npm install
npm run build      # tsc -> dist/
npm run dev        # run the CLI from TS sources via ts-node
```

> `dist/` is committed to the repo so `npm install -g github:…` works with no
> build step (and no compiler) — important for installs behind restricted
> networks. **Rebuild and commit `dist/` whenever you change `src/`.**

`npm run dev` runs `src/cli/index.ts` directly. Pass a subcommand, e.g. `npm run dev -- run`.

## Project layout

```
src/
  cli/
    index.ts      # entry point + command dispatch (init | run | profile)
    init.ts       # interactive setup wizard
    profile.ts    # `profile` command — list / use / add / edit / remove / switch
    wizard.ts     # shared interactive line builder (used by init + profile)
    detect.ts     # detects an existing statusLine tool to wrap
  widgets/
    worldcup.ts   # FIFA World Cup scoreboard (ESPN)
    news.ts       # RSS headlines
    soccer.ts     # football news (RSS)
    passthrough.ts# runs an arbitrary command, output verbatim
    cache.ts      # tiny file cache with TTL (~/.claudelobby/cache)
    shorten.ts    # text-shortening helpers
    rss.ts        # minimal RSS fetch/parse
  runner.ts       # resolves active lines, runs widgets, prints output
  config.ts       # config load/save + profile resolution + legacy migration
  types.ts        # config + widget types
  i18n.ts         # en / pt-BR strings
```

## How a render works

1. Claude Code calls `claudelobby run` and pipes a JSON payload on stdin.
2. `runner.run()` loads `~/.claudelobby/config.json` and calls `resolveLines()`, which picks the active profile (manual override → scheduled switch → `activeProfile`) and returns its lines.
3. Each line's widgets are fetched in parallel; their items are flattened and the current one is picked from a time-based index (so the bar rotates without keeping state).
4. `passthrough` lines are special: their command runs with the stdin payload forwarded, and the output is printed verbatim (so tools like `ccstatusline` work unchanged).

## Adding a widget

1. Add the widget's config shape to `src/types.ts` and include it in the `WidgetConfig` union.
2. Create `src/widgets/<name>.ts` exporting `getItems(config, lang?): Promise<string[]>`. Each returned string is one rotation item.
3. Wire it into the `switch` in `src/runner.ts` (`widgetItems`).
4. Add it to the shared line builder in `src/cli/wizard.ts` (`WidgetType`, `configureWidget`, and the content-widget options) — both `init` and `profile add/edit` pick it up.
5. Add any user-facing strings to `src/i18n.ts` for both `en` and `pt`.

If the widget hits the network, cache responses via `src/widgets/cache.ts` (`loadCache`/`saveCache`) with a sensible TTL — the bar refreshes roughly once a second, so uncached fetches would be abusive.

## Caches & config locations

- Config: `~/.claudelobby/config.json`
- Cache: `~/.claudelobby/cache/*.json`
- Claude Code settings touched: `~/.claude/settings.json` (`statusLine` block only)

## Type-checking

```bash
npx tsc --noEmit
```

The codebase uses `noImplicitAny`. ESPN/RSS payloads are untyped, so parsing code annotates the loosely-typed boundaries with `any` and local `eslint-disable` comments — keep that confined to the parse layer.
