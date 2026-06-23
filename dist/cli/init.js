import * as p from '@clack/prompts';
import { saveConfig, saveClaudeSettings, loadClaudeSettings, configExists } from '../config.js';
import { detectExistingStatusLine } from './detect.js';
import { messages } from '../i18n.js';
import { bail, configureLines, hours } from './wizard.js';
// ─── profiles ────────────────────────────────────────────────────────────────
async function configureProfiles(m, detected) {
    const profiles = {};
    while (true) {
        const first = Object.keys(profiles).length === 0;
        const nameRaw = await p.text({
            message: m.profileName,
            placeholder: first ? 'default' : 'evening',
            initialValue: first ? 'default' : '',
        });
        bail(nameRaw);
        let name = nameRaw.trim() || (first ? 'default' : `profile${Object.keys(profiles).length + 1}`);
        while (profiles[name])
            name += '-2'; // avoid clobbering a duplicate name
        p.log.step(m.configureProfile(name));
        profiles[name] = await configureLines(m, detected);
        const more = await p.confirm({ message: m.addAnotherProfile, initialValue: false });
        bail(more);
        if (!more)
            break;
    }
    return profiles;
}
// ─── scheduled switches ────────────────────────────────────────────────────────
async function configureSwitches(m, names) {
    const switches = [];
    const profileOptions = names.map(n => ({ value: n, label: n }));
    let addMore = true;
    while (addMore) {
        const at = await p.select({ message: m.switchAt, options: hours() });
        bail(at);
        const profile = await p.select({ message: m.switchToProfile, options: profileOptions });
        bail(profile);
        switches.push({ at: at, profile: profile });
        const more = await p.confirm({ message: m.addAnotherSwitch, initialValue: false });
        bail(more);
        addMore = more;
    }
    return switches;
}
// ─── main ────────────────────────────────────────────────────────────────────
export async function init() {
    const lang = await p.select({
        message: 'Language / Idioma',
        options: [
            { value: 'en', label: 'English' },
            { value: 'pt', label: 'Português (BR)' },
        ],
        initialValue: 'en',
    });
    bail(lang);
    const m = messages(lang);
    p.intro(m.intro);
    if (configExists()) {
        const overwrite = await p.confirm({ message: m.overwrite, initialValue: false });
        bail(overwrite);
        if (!overwrite) {
            p.cancel(m.cancelled);
            return;
        }
    }
    const detected = detectExistingStatusLine();
    if (detected)
        p.note(`"${detected.command}"`, m.detected(detected.name));
    // ── Profiles ──
    p.log.message(m.profilesSection);
    const profiles = await configureProfiles(m, detected);
    const names = Object.keys(profiles);
    // ── Active profile ──
    let activeProfile = names[0];
    if (names.length > 1) {
        const a = await p.select({ message: m.chooseActive, options: names.map(n => ({ value: n, label: n })) });
        bail(a);
        activeProfile = a;
    }
    // ── Time-based switching ──
    let switches = [];
    if (names.length > 1) {
        const auto = await p.confirm({ message: m.setupSwitching, initialValue: false });
        bail(auto);
        if (auto)
            switches = await configureSwitches(m, names);
    }
    const config = { lang: lang, activeProfile, profiles, switches };
    saveConfig(config);
    const updateSettings = await p.confirm({ message: m.updateSettings, initialValue: true });
    bail(updateSettings);
    if (updateSettings) {
        const settings = loadClaudeSettings();
        settings.statusLine = { type: 'command', command: 'claudelobby run', padding: 0, refreshInterval: 1000 };
        saveClaudeSettings(settings);
    }
    p.outro(m.done);
}
