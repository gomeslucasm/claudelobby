import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
export const CONFIG_DIR = join(homedir(), '.claudelobby');
export const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
export const CLAUDE_SETTINGS = join(homedir(), '.claude', 'settings.json');
export const CACHE_DIR = join(CONFIG_DIR, 'cache');
export function configExists() {
    return existsSync(CONFIG_FILE);
}
export function loadConfig() {
    if (!existsSync(CONFIG_FILE))
        return null;
    const raw = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
    return migrate(raw);
}
// Converts the pre-profiles schema (default.lines + schedules with per-line
// overrides) into the profile model, so old configs keep working.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrate(raw) {
    if (raw && raw.profiles)
        return raw;
    const base = raw?.default?.lines ?? [[]];
    const profiles = { default: base };
    const switches = [];
    for (const s of raw?.schedules ?? []) {
        profiles[s.name] = base.map((line, i) => s.overrides?.[String(i)] ?? line);
        switches.push({ at: s.from, profile: s.name });
        switches.push({ at: s.to, profile: 'default' });
    }
    return { lang: raw?.lang ?? 'en', activeProfile: 'default', profiles, switches };
}
export function saveConfig(config) {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}
export function loadClaudeSettings() {
    if (!existsSync(CLAUDE_SETTINGS))
        return {};
    return JSON.parse(readFileSync(CLAUDE_SETTINGS, 'utf8'));
}
export function saveClaudeSettings(settings) {
    writeFileSync(CLAUDE_SETTINGS, JSON.stringify(settings, null, 2));
}
const toMin = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
};
// Resolves which profile is active right now. A manual override wins until its
// `until` time; otherwise scheduled switches decide by wall clock; with no
// switches, the manually-selected `activeProfile` is used.
export function resolveProfileName(config, now = new Date()) {
    const fallback = config.activeProfile ?? Object.keys(config.profiles)[0];
    if (config.override
        && new Date(config.override.until).getTime() > now.getTime()
        && config.profiles[config.override.profile]) {
        return config.override.profile;
    }
    const switches = (config.switches ?? []).filter(s => config.profiles[s.profile]);
    if (!switches.length)
        return fallback;
    const cur = now.getHours() * 60 + now.getMinutes();
    const sorted = [...switches].sort((a, b) => toMin(a.at) - toMin(b.at));
    // Before the first switch of the day, the last switch (carried from
    // yesterday) is still in effect.
    let chosen = sorted[sorted.length - 1].profile;
    for (const s of sorted)
        if (toMin(s.at) <= cur)
            chosen = s.profile;
    return chosen;
}
export function resolveLines(config, now = new Date()) {
    const name = resolveProfileName(config, now);
    return config.profiles[name] ?? config.profiles[config.activeProfile] ?? Object.values(config.profiles)[0] ?? [];
}
// The next scheduled switch strictly after `now` (today, else tomorrow).
export function nextSwitchTime(now, switches) {
    if (!switches.length)
        return null;
    const cur = now.getHours() * 60 + now.getMinutes();
    const mins = switches.map(s => toMin(s.at)).sort((a, b) => a - b);
    const next = mins.find(m => m > cur);
    const d = new Date(now);
    if (next === undefined) {
        d.setDate(d.getDate() + 1);
        d.setHours(Math.floor(mins[0] / 60), mins[0] % 60, 0, 0);
    }
    else {
        d.setHours(Math.floor(next / 60), next % 60, 0, 0);
    }
    return d;
}
// Switch profile by hand. The choice holds until the next scheduled switch.
export function useProfile(config, name, now = new Date()) {
    config.activeProfile = name;
    const next = nextSwitchTime(now, config.switches ?? []);
    if (next)
        config.override = { profile: name, until: next.toISOString() };
    else
        delete config.override;
}
