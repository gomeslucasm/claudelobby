import * as p from '@clack/prompts';
import { loadConfig, saveConfig, resolveProfileName, useProfile } from '../config.js';
import { messages } from '../i18n.js';
import { detectExistingStatusLine } from './detect.js';
import { bail, configureLines } from './wizard.js';
import type { ClaudebarConfig } from '../types.js';

function fmtHold(config: ClaudebarConfig): string {
  if (!config.override) return '';
  const d = new Date(config.override.until);
  return ` (until ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')})`;
}

function isValidTime(t: string): boolean {
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(t);
}

// Normalize "9:5" → never; we require HH:MM but accept single-digit hour → pad.
function normTime(t: string): string {
  const [h, m] = t.split(':');
  return `${h.padStart(2, '0')}:${m}`;
}

export async function profile(args: string[]): Promise<void> {
  const config = loadConfig();
  if (!config) { console.log('claudelobby: not configured. Run: claudelobby init'); return; }
  const m = messages(config.lang);
  const names = () => Object.keys(config.profiles);
  const sub = args[0] ?? 'list';

  // ── current ──
  if (sub === 'current') { console.log(resolveProfileName(config)); return; }

  // ── use ──
  if (sub === 'use') {
    const name = args[1];
    if (!name) { console.log('Usage: claudelobby profile use <name>'); process.exit(1); }
    if (!config.profiles[name]) { console.log(m.pm.unknown(name, names().join(', '))); process.exit(1); }
    useProfile(config, name);
    saveConfig(config);
    console.log(`Switched to "${name}"${fmtHold(config)}.`);
    return;
  }

  // ── add ──
  if (sub === 'add') {
    p.intro(m.pm.addIntro);
    let name = args[1]?.trim();
    if (!name) {
      const t = await p.text({ message: m.profileName, placeholder: 'matchday' });
      bail(t);
      name = (t as string).trim();
    }
    if (!name) { p.cancel(m.cancelled); return; }
    if (config.profiles[name]) { p.cancel(m.pm.nameTaken(name)); return; }

    config.profiles[name] = await configureLines(m, detectExistingStatusLine());
    saveConfig(config);
    p.log.success(m.pm.added(name));

    const useIt = await p.confirm({ message: m.pm.useNow(name), initialValue: false });
    bail(useIt);
    if (useIt) { useProfile(config, name); saveConfig(config); }
    p.outro(m.done);
    return;
  }

  // ── edit ──
  if (sub === 'edit') {
    const name = args[1];
    if (!name) { console.log('Usage: claudelobby profile edit <name>'); process.exit(1); }
    if (!config.profiles[name]) { console.log(m.pm.unknown(name, names().join(', '))); process.exit(1); }
    p.intro(m.pm.editIntro(name));
    config.profiles[name] = await configureLines(m, detectExistingStatusLine());
    saveConfig(config);
    p.outro(m.pm.edited(name));
    return;
  }

  // ── remove / rm / delete ──
  if (sub === 'remove' || sub === 'rm' || sub === 'delete') {
    const name = args[1];
    if (!name) { console.log('Usage: claudelobby profile remove <name>'); process.exit(1); }
    if (!config.profiles[name]) { console.log(m.pm.unknown(name, names().join(', '))); process.exit(1); }
    if (names().length <= 1) { console.log(m.pm.cannotRemoveLast); process.exit(1); }

    const ok = await p.confirm({ message: m.pm.removeConfirm(name), initialValue: false });
    bail(ok);
    if (!ok) { p.cancel(m.cancelled); return; }

    delete config.profiles[name];
    // prune dangling references
    const before = config.switches?.length ?? 0;
    config.switches = (config.switches ?? []).filter(s => s.profile !== name);
    const pruned = before - config.switches.length;
    if (config.override?.profile === name) delete config.override;
    if (config.activeProfile === name) config.activeProfile = names()[0];

    saveConfig(config);
    p.log.success(m.pm.removed(name));
    if (pruned) p.log.message(m.pm.prunedSwitches(pruned));
    return;
  }

  // ── switch add / remove ──
  if (sub === 'switch') {
    const action = args[1];
    if (action === 'add') {
      const rawTime = args[2], prof = args[3];
      if (!rawTime || !prof) { console.log('Usage: claudelobby profile switch add <HH:MM> <profile>'); process.exit(1); }
      if (!isValidTime(rawTime)) { console.log(m.pm.badTime); process.exit(1); }
      if (!config.profiles[prof]) { console.log(m.pm.unknown(prof, names().join(', '))); process.exit(1); }
      const at = normTime(rawTime);
      config.switches = (config.switches ?? []).filter(s => s.at !== at); // replace any at the same time
      config.switches.push({ at, profile: prof });
      config.switches.sort((a, b) => a.at.localeCompare(b.at));
      saveConfig(config);
      console.log(m.pm.switchAdded(at, prof));
      return;
    }
    if (action === 'remove' || action === 'rm' || action === 'delete') {
      const rawTime = args[2];
      if (!rawTime) { console.log('Usage: claudelobby profile switch remove <HH:MM>'); process.exit(1); }
      const at = isValidTime(rawTime) ? normTime(rawTime) : rawTime;
      const before = config.switches?.length ?? 0;
      config.switches = (config.switches ?? []).filter(s => s.at !== at);
      saveConfig(config);
      console.log(before === config.switches.length ? m.pm.switchNone(at) : m.pm.switchRemoved(at));
      return;
    }
    console.log('Usage: claudelobby profile switch add <HH:MM> <profile> | remove <HH:MM>');
    process.exit(1);
  }

  // ── list (default) ──
  const current = resolveProfileName(config);
  console.log('Profiles:');
  for (const n of names()) {
    const mark = n === current ? '●' : '○';
    const lines = config.profiles[n].length;
    const act = n === config.activeProfile ? '  [active]' : '';
    console.log(`  ${mark} ${n}  (${lines} line${lines === 1 ? '' : 's'})${act}`);
  }
  if (config.switches?.length) {
    console.log('\nScheduled switches:');
    for (const s of [...config.switches].sort((a, b) => a.at.localeCompare(b.at))) {
      console.log(`  ${s.at} → ${s.profile}`);
    }
  }
}
