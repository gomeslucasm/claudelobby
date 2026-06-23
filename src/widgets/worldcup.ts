import https from 'https';
import { loadCache, saveCache } from './cache.js';
import { worldCupLabels } from '../i18n.js';
import type { WorldCupWidget, Lang } from '../types.js';

const ESPN_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';
const LIVE_TTL = 30;
const UPCOMING_TTL = 300;

// ESPN team names → Portuguese. Only applied when lang === 'pt'.
const NAME_MAP_PT: Record<string, string> = {
  'South Korea': 'Coreia do Sul', 'Korea Republic': 'Coreia do Sul',
  'Czechia': 'Rep. Tcheca', 'Czech Republic': 'Rep. Tcheca',
  'South Africa': 'África do Sul', 'Netherlands': 'Holanda',
  'United States': 'EUA', 'Switzerland': 'Suíça',
  'Bosnia-Herzegovina': 'Bósnia', 'Bosnia and Herzegovina': 'Bósnia',
  'Qatar': 'Catar', 'Morocco': 'Marrocos', 'Scotland': 'Escócia',
  'Australia': 'Austrália', 'Turkey': 'Turquia', 'Germany': 'Alemanha',
  "Ivory Coast": 'Costa do Marfim', "Cote d'Ivoire": 'Costa do Marfim',
  'Ecuador': 'Equador', 'Japan': 'Japão', 'Sweden': 'Suécia',
  'Tunisia': 'Tunísia', 'Belgium': 'Bélgica', 'Egypt': 'Egito',
  'Iran': 'Irã', 'New Zealand': 'Nova Zelândia', 'Spain': 'Espanha',
  'Cape Verde': 'Cabo Verde', 'Saudi Arabia': 'Arábia Saudita',
  'Uruguay': 'Uruguai', 'France': 'França', 'Iraq': 'Iraque',
  'Norway': 'Noruega', 'Algeria': 'Argélia', 'Austria': 'Áustria',
  'Jordan': 'Jordânia', 'DR Congo': 'RD Congo', 'Uzbekistan': 'Uzbequistão',
  'Colombia': 'Colômbia', 'England': 'Inglaterra', 'Croatia': 'Croácia',
  'Ghana': 'Gana', 'Panama': 'Panamá', 'Mexico': 'México',
  'Brazil': 'Brasil', 'Canada': 'Canadá',
};

function teamName(n: string, lang: Lang) {
  return lang === 'pt' ? (NAME_MAP_PT[n] ?? n) : n;
}

function fetchJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch(e) { reject(e); } });
    });
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

interface Match { home: string; away: string; hs: number; as: number; minute?: string; homeScorers?: string[]; awayScorers?: string[] }
interface UpcomingMatch { home: string; away: string; date: string }
interface EspnData { live: Match[]; finished: Match[]; upcoming: UpcomingMatch[] }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseEvents(data: any, lang: Lang): EspnData {
  const labels = worldCupLabels(lang);
  const minuteLabel: Record<string, string> = {
    STATUS_HALFTIME: labels.half, STATUS_EXTRA_TIME: labels.extra, STATUS_PENALTY: labels.pen,
  };
  const live: Match[] = [], finished: Match[] = [], upcoming: UpcomingMatch[] = [];
  for (const e of (data?.events ?? [])) {
    const comp = e.competitions?.[0];
    if (!comp) continue;
    const { state, name: statusName } = comp.status?.type ?? {};
    const clock: string = comp.status?.displayClock ?? '';
    const comps = comp.competitors ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const homeC = comps.find((c: any) => c.homeAway === 'home');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const awayC = comps.find((c: any) => c.homeAway === 'away');
    if (!homeC || !awayC) continue;
    const home = teamName(homeC.team?.displayName ?? '', lang);
    const away = teamName(awayC.team?.displayName ?? '', lang);
    // Scorers: take up to 4 goals total, ordered by minute, split by team.
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const goals = ((comp.details ?? []) as any[])
      .filter((d: any) => d.scoringPlay)
      .sort((a: any, b: any) => Number(a.clock?.value ?? 0) - Number(b.clock?.value ?? 0))
      .slice(0, 4)
      .map((d: any) => {
        const ath = d.athletesInvolved?.[0];
        const nm = ath?.shortName ?? ath?.displayName ?? '';
        const min = d.clock?.displayValue ?? '';
        const mark = d.penaltyKick ? ' (p)' : d.ownGoal ? ' (gc)' : '';
        return { teamId: d.team?.id, label: `${nm} ${min}${mark}`.trim() };
      });
    /* eslint-enable @typescript-eslint/no-explicit-any */
    const homeScorers = goals.filter(g => g.teamId === homeC.team?.id).map(g => g.label);
    const awayScorers = goals.filter(g => g.teamId === awayC.team?.id).map(g => g.label);
    if (state === 'in')
      live.push({ home, away, hs: Number(homeC.score ?? 0), as: Number(awayC.score ?? 0), minute: minuteLabel[statusName] ?? clock, homeScorers, awayScorers });
    else if (state === 'post')
      finished.push({ home, away, hs: Number(homeC.score ?? 0), as: Number(awayC.score ?? 0), homeScorers, awayScorers });
    else if (state === 'pre')
      upcoming.push({ home, away, date: comp.date ?? '' });
  }
  return { live, finished, upcoming };
}

// Formats using the machine's local timezone.
function fmtUpcoming(m: UpcomingMatch, lang: Lang): string {
  try {
    const d = new Date(m.date);
    const wd = worldCupLabels(lang).weekdays[d.getDay()];
    const day = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
    const hour = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    return `${m.home} x ${m.away} ${wd} ${day} ${hour}`;
  } catch { return `${m.home} x ${m.away}`; }
}

async function getLiveData(lang: Lang): Promise<EspnData> {
  const cached = loadCache<EspnData>(`worldcup_live_${lang}`, LIVE_TTL);
  if (cached) return cached;
  const data = await fetchJson(ESPN_URL).catch(() => ({}));
  const result = parseEvents(data, lang);
  saveCache(`worldcup_live_${lang}`, result);
  return result;
}

async function getUpcoming(lang: Lang): Promise<UpcomingMatch[]> {
  const cached = loadCache<UpcomingMatch[]>(`worldcup_upcoming_${lang}`, UPCOMING_TTL);
  if (cached) return cached;
  const upcoming: UpcomingMatch[] = [];
  const seen = new Set<string>();
  const now = new Date();
  for (let delta = 0; delta < 5 && upcoming.length < 6; delta++) {
    const d = new Date(now);
    d.setDate(d.getDate() + delta);
    const dateStr = d.toISOString().slice(0,10).replace(/-/g,'');
    const data = await fetchJson(`${ESPN_URL}?dates=${dateStr}`).catch(() => ({}));
    for (const m of parseEvents(data, lang).upcoming) {
      const key = `${m.home}|${m.away}`;
      if (!seen.has(key)) { seen.add(key); upcoming.push(m); }
    }
  }
  upcoming.sort((a,b) => a.date.localeCompare(b.date));
  saveCache(`worldcup_upcoming_${lang}`, upcoming);
  return upcoming;
}

export async function getItems(_config: WorldCupWidget, lang: Lang = 'en'): Promise<string[]> {
  const labels = worldCupLabels(lang);
  const { live, finished, upcoming: todayUpcoming } = await getLiveData(lang);
  const upcoming = todayUpcoming.length ? todayUpcoming : await getUpcoming(lang);

  const withScorers = (name: string, scorers?: string[]) =>
    scorers && scorers.length ? `${name} (${scorers.join(', ')})` : name;

  const results = [
    ...live.map(m => `${labels.live} ${m.minute} | ${withScorers(m.home, m.homeScorers)} ${m.hs} x ${m.as} ${withScorers(m.away, m.awayScorers)}`),
    ...finished.map(m => `${labels.ft} | ${withScorers(m.home, m.homeScorers)} ${m.hs} x ${m.as} ${withScorers(m.away, m.awayScorers)}`),
  ];

  if (results.length) {
    const rotation: string[] = [];
    const next2 = upcoming.slice(0, 2);
    results.forEach((r, i) => {
      rotation.push(r);
      if ((i + 1) % 3 === 0 && next2.length)
        rotation.push(`${labels.upcoming}: ${next2.map(u => fmtUpcoming(u, lang)).join('  |  ')}`);
    });
    return rotation;
  }

  if (upcoming.length)
    return [`${labels.cup}: ${upcoming.slice(0,3).map(u => fmtUpcoming(u, lang)).join('  |  ')}`];

  return [labels.none];
}
