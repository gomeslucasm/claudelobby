import * as p from '@clack/prompts';
import { saveConfig, saveClaudeSettings, loadClaudeSettings, configExists } from '../config.js';
import { detectExistingStatusLine } from './detect.js';
import { messages, type Messages } from '../i18n.js';
import { bail, configureLines, hours, type Detected } from './wizard.js';
import type { ClaudebarConfig, LineConfig, ProfileSwitch, Lang } from '../types.js';

// ─── profiles ────────────────────────────────────────────────────────────────

async function configureProfiles(m: Messages, detected: Detected): Promise<Record<string, LineConfig[]>> {
  const profiles: Record<string, LineConfig[]> = {};

  while (true) {
    const first = Object.keys(profiles).length === 0;
    const nameRaw = await p.text({
      message: m.profileName,
      placeholder: first ? 'default' : 'evening',
      initialValue: first ? 'default' : '',
    });
    bail(nameRaw);
    let name = (nameRaw as string).trim() || (first ? 'default' : `profile${Object.keys(profiles).length + 1}`);
    while (profiles[name]) name += '-2'; // avoid clobbering a duplicate name

    p.log.step(m.configureProfile(name));
    profiles[name] = await configureLines(m, detected);

    const more = await p.confirm({ message: m.addAnotherProfile, initialValue: false });
    bail(more);
    if (!more) break;
  }

  return profiles;
}

// ─── scheduled switches ────────────────────────────────────────────────────────

async function configureSwitches(m: Messages, names: string[]): Promise<ProfileSwitch[]> {
  const switches: ProfileSwitch[] = [];
  const profileOptions = names.map(n => ({ value: n, label: n }));

  let addMore = true;
  while (addMore) {
    const at = await p.select({ message: m.switchAt, options: hours() });
    bail(at);
    const profile = await p.select({ message: m.switchToProfile, options: profileOptions });
    bail(profile);
    switches.push({ at: at as string, profile: profile as string });

    const more = await p.confirm({ message: m.addAnotherSwitch, initialValue: false });
    bail(more);
    addMore = more as boolean;
  }

  return switches;
}

// ─── main ────────────────────────────────────────────────────────────────────

export async function init(): Promise<void> {
  const lang = await p.select<Lang>({
    message: 'Language / Idioma',
    options: [
      { value: 'en', label: 'English' },
      { value: 'pt', label: 'Português (BR)' },
    ],
    initialValue: 'en',
  });
  bail(lang);
  const m = messages(lang as Lang);

  p.intro(m.intro);

  if (configExists()) {
    const overwrite = await p.confirm({ message: m.overwrite, initialValue: false });
    bail(overwrite);
    if (!overwrite) { p.cancel(m.cancelled); return; }
  }

  const detected = detectExistingStatusLine();
  if (detected) p.note(`"${detected.command}"`, m.detected(detected.name));

  // ── Profiles ──
  p.log.message(m.profilesSection);
  const profiles = await configureProfiles(m, detected);
  const names = Object.keys(profiles);

  // ── Active profile ──
  let activeProfile = names[0];
  if (names.length > 1) {
    const a = await p.select({ message: m.chooseActive, options: names.map(n => ({ value: n, label: n })) });
    bail(a);
    activeProfile = a as string;
  }

  // ── Time-based switching ──
  let switches: ProfileSwitch[] = [];
  if (names.length > 1) {
    const auto = await p.confirm({ message: m.setupSwitching, initialValue: false });
    bail(auto);
    if (auto) switches = await configureSwitches(m, names);
  }

  const config: ClaudebarConfig = { lang: lang as Lang, activeProfile, profiles, switches };
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
