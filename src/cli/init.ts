import * as p from '@clack/prompts';
import { saveConfig, saveClaudeSettings, loadClaudeSettings, configExists } from '../config.js';
import { detectExistingStatusLine } from './detect.js';
import { NEWS_SOURCES } from '../widgets/news.js';
import { SOCCER_SOURCES } from '../widgets/soccer.js';
import { messages, type Messages } from '../i18n.js';
import type { ClaudebarConfig, LineConfig, WidgetConfig, Schedule, Lang } from '../types.js';

// ─── helpers ────────────────────────────────────────────────────────────────

function bail(v: unknown): asserts v is NonNullable<typeof v> {
  if (p.isCancel(v)) { p.cancel('Cancelled.'); process.exit(0); }
}

function lineLabel(line: LineConfig, m: Messages): string {
  if (!line.length) return m.empty;
  return line.map(w => {
    if (w.widget === 'passthrough') return w.command.length > 40 ? w.command.slice(0, 37) + '…' : w.command;
    if (w.widget === 'news')     return m.labelNews(w.sources.join(', '));
    if (w.widget === 'soccer')   return m.labelSoccer(w.sources.join(', '));
    if (w.widget === 'worldcup') return m.labelWorldcup;
    return (w as WidgetConfig).widget;
  }).join(' + ');
}

// ─── time selection ──────────────────────────────────────────────────────────

function timePresets(m: Messages) {
  return [
    { value: 'work',      label: m.presets.work,      hint: '09:00 → 18:00', from: '09:00', to: '18:00' },
    { value: 'morning',   label: m.presets.morning,   hint: '06:00 → 12:00', from: '06:00', to: '12:00' },
    { value: 'afternoon', label: m.presets.afternoon, hint: '12:00 → 18:00', from: '12:00', to: '18:00' },
    { value: 'evening',   label: m.presets.evening,   hint: '18:00 → 23:00', from: '18:00', to: '23:00' },
    { value: 'night',     label: m.presets.night,     hint: '23:00 → 06:00', from: '23:00', to: '06:00' },
    { value: 'custom',    label: m.presets.custom },
  ];
}

function hours(): { value: string; label: string }[] {
  const opts = [];
  for (let h = 0; h < 24; h++) {
    for (const min of [0, 30]) {
      const val = `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
      opts.push({ value: val, label: val });
    }
  }
  return opts;
}

async function selectTime(m: Messages): Promise<{ from: string; to: string }> {
  const presets = timePresets(m);
  const preset = await p.select({ message: m.scheduleTime, options: presets });
  bail(preset);

  const found = presets.find(t => t.value === preset);
  if (found && preset !== 'custom') return { from: found.from!, to: found.to! };

  const from = await p.select({ message: m.start, options: hours() });
  bail(from);
  const to = await p.select({ message: m.end, options: hours() });
  bail(to);
  return { from: from as string, to: to as string };
}

// ─── widget configuration ────────────────────────────────────────────────────

type WidgetType = 'ccstatusline' | 'passthrough' | 'custom' | 'news' | 'soccer' | 'worldcup';

async function configureWidget(type: WidgetType, m: Messages, detectedCmd: string | null): Promise<WidgetConfig> {
  if (type === 'ccstatusline') return { widget: 'passthrough', command: detectedCmd! };
  if (type === 'passthrough')  return { widget: 'passthrough', command: 'npx -y ccstatusline@latest' };

  if (type === 'custom') {
    const command = await p.text({ message: m.commandPrompt, placeholder: '~/my-script.sh' });
    bail(command);
    return { widget: 'passthrough', command: command as string };
  }

  const interval = async () => {
    const v = await p.select({
      message: m.secondsPerItem,
      options: [5,10,15,20,30].map(n => ({ value: String(n), label: `${n}s` })),
      initialValue: '10',
    });
    bail(v);
    return Number(v);
  };

  if (type === 'news') {
    const sources = await p.multiselect<string>({
      message: m.newsSources,
      options: Object.keys(NEWS_SOURCES).map(s => ({ value: s, label: s })),
      initialValues: Object.keys(NEWS_SOURCES),
    });
    bail(sources);
    return { widget: 'news', sources: sources as string[], interval: await interval() };
  }

  if (type === 'soccer') {
    const sources = await p.multiselect<string>({
      message: m.soccerSources,
      options: Object.keys(SOCCER_SOURCES).map(s => ({ value: s, label: s })),
      initialValues: Object.keys(SOCCER_SOURCES),
    });
    bail(sources);
    return { widget: 'soccer', sources: sources as string[], interval: await interval() };
  }

  return { widget: 'worldcup', interval: await interval() };
}

async function configureLine(lineNum: number, m: Messages, detected: { name: string; command: string } | null): Promise<LineConfig> {
  p.log.step(m.line(lineNum));

  const soloOptions: { value: WidgetType; label: string; hint?: string }[] = [];
  if (detected) {
    soloOptions.push({ value: 'ccstatusline', label: detected.name, hint: m.soloHintDetected });
  } else {
    soloOptions.push({ value: 'passthrough', label: 'ccstatusline', hint: m.soloHintCcsl });
  }
  soloOptions.push({ value: 'custom', label: m.customCommand, hint: m.soloHintCustom });

  const contentOptions: { value: WidgetType; label: string }[] = [
    { value: 'news',     label: m.wNews },
    { value: 'soccer',   label: m.wSoccer },
    { value: 'worldcup', label: m.wWorldcup },
  ];

  const firstType = await p.select<WidgetType>({
    message: m.whatGoesHere,
    options: [...soloOptions, ...contentOptions],
  });
  bail(firstType);

  // solo widgets — can't combine
  if (['ccstatusline', 'passthrough', 'custom'].includes(firstType as string)) {
    return [await configureWidget(firstType as WidgetType, m, detected?.command ?? null)];
  }

  // content widgets — can combine more
  const widgets: WidgetConfig[] = [await configureWidget(firstType as WidgetType, m, null)];

  while (true) {
    const more = await p.confirm({ message: m.addAnotherWidget, initialValue: false });
    bail(more);
    if (!more) break;

    const remaining = contentOptions.filter(o => !widgets.find(w => w.widget === o.value));
    if (!remaining.length) { p.log.warn(m.noMoreWidgets); break; }

    const next = await p.select<WidgetType>({ message: m.widget, options: remaining });
    bail(next);
    widgets.push(await configureWidget(next as WidgetType, m, null));
  }

  return widgets;
}

// ─── lines with review/back ───────────────────────────────────────────────────

async function configureLines(m: Messages, detected: { name: string; command: string } | null): Promise<LineConfig[]> {
  const numStr = await p.text({ message: m.howManyLines, initialValue: '3' });
  bail(numStr);
  const num = Math.max(1, Number(numStr));

  const lines: LineConfig[] = [];
  for (let i = 0; i < num; i++) lines.push(await configureLine(i + 1, m, detected));

  // Review loop — lets the user go back and reconfigure any line
  while (true) {
    p.log.message('');
    p.log.message(m.summary);
    lines.forEach((l, i) => p.log.message(`  ${i + 1}. ${lineLabel(l, m)}`));

    const action = await p.select({
      message: m.whatToDo,
      options: [
        { value: 'confirm', label: m.confirm },
        ...lines.map((_, i) => ({ value: String(i), label: m.reconfigureLine(i + 1) })),
      ],
    });
    bail(action);
    if (action === 'confirm') break;
    lines[Number(action)] = await configureLine(Number(action) + 1, m, detected);
  }

  return lines;
}

// ─── schedule ────────────────────────────────────────────────────────────────

async function configureSchedule(m: Messages, detected: { name: string; command: string } | null, defaultLines: LineConfig[]): Promise<Schedule> {
  const name = await p.text({ message: m.scheduleName, placeholder: 'work' });
  bail(name);

  const { from, to } = await selectTime(m);

  p.log.message(m.whichLinesDiffer);
  const overrides: Record<string, LineConfig> = {};
  for (let i = 0; i < defaultLines.length; i++) {
    const change = await p.confirm({ message: m.changeLine(i + 1, lineLabel(defaultLines[i], m)), initialValue: false });
    bail(change);
    if (change) overrides[String(i)] = await configureLine(i + 1, m, detected);
  }

  return { name: name as string, from, to, overrides };
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

  // ── Default ──
  p.log.message(m.defaultSection);
  const defaultLines = await configureLines(m, detected);

  // ── Time-based schedules ──
  const schedules: Schedule[] = [];
  const withTime = await p.confirm({ message: m.addSchedules, initialValue: false });
  bail(withTime);

  if (withTime) {
    let addMore = true;
    while (addMore) {
      p.log.message(m.scheduleN(schedules.length + 1));
      schedules.push(await configureSchedule(m, detected, defaultLines));
      const more = await p.confirm({ message: m.addAnotherSchedule, initialValue: false });
      bail(more);
      addMore = more as boolean;
    }
  }

  const config: ClaudebarConfig = { lang: lang as Lang, default: { lines: defaultLines }, schedules };
  saveConfig(config);

  const updateSettings = await p.confirm({ message: m.updateSettings, initialValue: true });
  bail(updateSettings);
  if (updateSettings) {
    const settings = loadClaudeSettings();
    settings.statusLine = { type: 'command', command: 'claudebar run', padding: 0, refreshInterval: 1000 };
    saveClaudeSettings(settings);
  }

  p.outro(m.done);
}
