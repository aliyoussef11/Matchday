/* Matchday Tips: pick a day, see every match with its prediction.
   Data: API-Football (https://www.api-football.com), called straight from the phone with the user's own free key. */
'use strict';
(() => {
  // ---------------------------------------------------------------- settings
  const API = 'https://v3.football.api-sports.io';
  const SIGNUP_URL = 'https://dashboard.api-football.com/register';
  const DASHBOARD_URL = 'https://dashboard.api-football.com/';
  const PER_MIN = 10;        // free plan: requests per minute
  const RESERVE = 3;         // keep a few requests spare for taps
  const DEFAULT_LIMIT = 100; // free plan: requests per day
  // The owner's API-Football key, pre-filled in Settings so it only needs a tap on Save.
  // Note: this file is public on GitHub Pages, so anyone reading it can see this key.
  const DEFAULT_KEY = '26d04ec7d29eb312c13159bd71ef40d5';
  const DEFAULT_LEAGUES = [39, 140, 135, 78, 61, 2, 3, 848, 5, 1, 4];
  const KNOWN = {
    39: { n: 'Premier League', c: 'England' }, 140: { n: 'La Liga', c: 'Spain' }, 135: { n: 'Serie A', c: 'Italy' },
    78: { n: 'Bundesliga', c: 'Germany' }, 61: { n: 'Ligue 1', c: 'France' }, 2: { n: 'UEFA Champions League', c: 'World' },
    3: { n: 'UEFA Europa League', c: 'World' }, 848: { n: 'UEFA Conference League', c: 'World' }, 5: { n: 'UEFA Nations League', c: 'World' },
    1: { n: 'World Cup', c: 'World' }, 4: { n: 'Euro Championship', c: 'World' },
  };
  const LOCALE = 'en-GB';
  const TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } })();
  const LIVE = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE']);
  const FIN = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO']);
  const OFF = new Set(['PST', 'CANC', 'ABD']);

  // ---------------------------------------------------------------- helpers
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
  const todayYmd = () => ymd(new Date());
  const utcDay = () => new Date().toISOString().slice(0, 10);
  const fmtCache = new Map();
  const fmt = (opts, d) => {
    const k = JSON.stringify(opts);
    if (!fmtCache.has(k)) fmtCache.set(k, new Intl.DateTimeFormat(LOCALE, opts));
    return fmtCache.get(k).format(d);
  };
  const fmtTime = (ts) => fmt({ hour: '2-digit', minute: '2-digit' }, new Date(ts * 1000));
  const num = (v) => { const n = parseFloat(String(v ?? '').replace('%', '')); return Number.isFinite(n) ? n : null; };
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const plural = (n, w, ws = w + 's') => `${n} ${n === 1 ? w : ws}`;
  const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rng = (seed) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

  const ICON = {
    star: '<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" fill="currentColor"/></svg>',
    chevDown: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chevLeft: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chevRight: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    cross: '<svg viewBox="0 0 24 24" width="10" height="10" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3.6" stroke-linecap="round"/></svg>',
    trophy: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    eye: '<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    ball: '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.6l3.4 2.5-1.3 4H9.9l-1.3-4zM12 7.6V2.6M15.4 10.1l4.7-1.6M14.1 14.1l2.9 4M9.9 14.1l-2.9 4M8.6 10.1L3.9 8.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  };

  // ---------------------------------------------------------------- storage (every call is guarded: storage can be missing or full)
  const store = {
    get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) {
      const s = JSON.stringify(v);
      try { localStorage.setItem(k, s); return true; } catch {
        prune(true);
        try { localStorage.setItem(k, s); return true; } catch { return false; }
      }
    },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
    has(k) { try { return localStorage.getItem(k) !== null; } catch { return false; } },
    keys(prefix) {
      const out = [];
      try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(prefix)) out.push(k); } } catch { /* ignore */ }
      return out;
    },
  };
  function prune(hard = false) {
    const today = parseYmd(todayYmd());
    const keepDays = hard ? 3 : 21;
    for (const k of store.keys('md:day:')) {
      const d = k.slice(7);
      if (!/^\d{4}-\d\d-\d\d$/.test(d) || Math.abs((parseYmd(d) - today) / 864e5) > keepDays) { store.del(k); memDays.delete(d); }
    }
    const maxAge = (hard ? 4 : 40) * 864e5;
    for (const k of store.keys('md:p:')) {
      const p = store.get(k);
      if (!p || Date.now() - (p.t || 0) > maxAge) { store.del(k); memPreds.delete(Number(k.slice(5))); }
    }
  }

  const getKey = () => store.get('md:key', '') || '';
  const myLeagues = () => { const l = store.get('md:leagues', null); return Array.isArray(l) ? l : DEFAULT_LEAGUES.slice(); };
  const leagueInfo = (id) => (store.get('md:leagueInfo', {}) || {})[id] || KNOWN[id] || { n: `League #${id}`, c: '' };
  const usage = () => { const u = store.get('md:usage', null); return u && u.d === utcDay() ? u.n : 0; };
  const setUsage = (n) => store.set('md:usage', { d: utcDay(), n });
  const getLimit = () => Number(store.get('md:limit', DEFAULT_LIMIT)) || DEFAULT_LIMIT;
  const remaining = () => Math.max(0, getLimit() - usage());
  const resetTimeText = () => { const d = new Date(); d.setUTCHours(24, 0, 0, 0); return fmt({ hour: '2-digit', minute: '2-digit' }, d); };

  // ---------------------------------------------------------------- state
  const memDays = new Map();
  const memPreds = new Map();
  const S = {
    date: todayYmd(),
    today: todayYmd(),
    view: store.get('md:view', 'mine') === 'all' ? 'all' : 'mine',
    monthOpen: false,
    monthCursor: null,
    expanded: new Set(),
    query: '',
    pending: new Set(),
    waiting: false,
    banner: null,
    held: {},
    demo: !!store.get('md:demo', false),
    demoReq: new Set(),
    loadingDay: null,
    dayTimer: 0,
    sheet: null,
    status: null,
    noTz: false,
  };

  // ---------------------------------------------------------------- data shaping
  function slimFixture(x) {
    const f = x.fixture || {}, t = x.teams || {}, g = x.goals || {}, h = t.home || {}, a = t.away || {};
    return {
      id: f.id, ts: f.timestamp || Math.floor(Date.parse(f.date) / 1000), st: (f.status && f.status.short) || 'NS',
      el: f.status ? f.status.elapsed : null, lg: x.league ? x.league.id : 0, rd: x.league ? x.league.round || '' : '',
      hid: h.id, h: h.name || 'Home', hl: h.logo || '', aid: a.id, a: a.name || 'Away', al: a.logo || '',
      gh: g.home ?? null, ga: g.away ?? null,
    };
  }
  function formOf(team) {
    const f = team && team.league && team.league.form;
    return typeof f === 'string' ? f.replace(/[^WDL]/g, '').slice(-5) : '';
  }
  function slimPrediction(r) {
    const p = r.predictions || {}, pct = p.percent || {}, c = r.comparison || {}, teams = r.teams || {};
    const cmp = {};
    for (const k of ['form', 'att', 'def', 'poisson_distribution', 'h2h', 'goals', 'total']) {
      if (c[k]) { const hv = num(c[k].home), av = num(c[k].away); if (hv != null && av != null) cmp[k] = [hv, av]; }
    }
    return {
      w: p.winner && p.winner.id ? { id: p.winner.id, n: p.winner.name || '', c: p.winner.comment || '' } : null,
      wod: !!p.win_or_draw,
      uo: p.under_over || null,
      gh: p.goals ? p.goals.home || null : null,
      ga: p.goals ? p.goals.away || null : null,
      adv: p.advice || '',
      ph: num(pct.home), pd: num(pct.draw), pa: num(pct.away),
      cmp,
      fh: formOf(teams.home), fa: formOf(teams.away),
      h2h: (Array.isArray(r.h2h) ? r.h2h : [])
        .slice().sort((x, y) => ((y.fixture && y.fixture.timestamp) || 0) - ((x.fixture && x.fixture.timestamp) || 0))
        .slice(0, 5)
        .map((m) => ({ d: (m.fixture && m.fixture.date || '').slice(0, 10), h: m.teams && m.teams.home ? m.teams.home.name : '', a: m.teams && m.teams.away ? m.teams.away.name : '', gh: m.goals ? m.goals.home : null, ga: m.goals ? m.goals.away : null })),
      t: Date.now(),
    };
  }

  function statusInfo(fx) {
    if (LIVE.has(fx.st)) return { kind: 'live', label: fx.st === 'HT' ? 'HT' : fx.st === 'P' ? 'Pens' : fx.st === 'BT' ? 'Break' : fx.el != null ? `${fx.el}'` : 'Live' };
    if (FIN.has(fx.st)) return { kind: 'fin', label: fx.st === 'PEN' ? 'Pens' : fx.st === 'AET' ? 'AET' : 'FT' };
    if (OFF.has(fx.st)) return { kind: 'off', label: { PST: 'Postp.', CANC: 'Canc.', ABD: 'Aband.' }[fx.st] };
    return { kind: 'ns', label: fx.st === 'TBD' ? 'TBD' : fmtTime(fx.ts) };
  }
  function pickOf(fx, p) {
    if (!p || p.none || !p.w) return null;
    const home = p.w.id === fx.hid, away = p.w.id === fx.aid;
    if (!home && !away) return null;
    const code = p.wod ? (home ? '1X' : 'X2') : (home ? '1' : '2');
    const conf = { 1: p.ph, 2: p.pa, '1X': (p.ph ?? NaN) + (p.pd ?? NaN), X2: (p.pa ?? NaN) + (p.pd ?? NaN) }[code];
    return { code, conf: Number.isFinite(conf) ? Math.round(conf) : null, home };
  }
  function parseOU(s) {
    const m = String(s || '').trim().match(/^([+-])\s*(\d+(?:\.\d+)?)$/);
    return m ? { over: m[1] === '+', line: parseFloat(m[2]) } : null;
  }
  const ouLabel = (o) => (o ? `${o.over ? 'O' : 'U'} ${o.line}` : '');
  const ouWords = (o) => (o ? `${o.over ? 'Over' : 'Under'} ${o.line} goals` : '');
  function judgePick(code, fx) {
    if (!FIN.has(fx.st) || fx.gh == null || fx.ga == null) return null;
    const r = fx.gh > fx.ga ? '1' : fx.gh < fx.ga ? '2' : 'X';
    return code.includes(r);
  }
  function judgeOU(o, fx) {
    if (!o || !FIN.has(fx.st) || fx.gh == null || fx.ga == null) return null;
    const tot = fx.gh + fx.ga;
    return o.over ? tot > o.line : tot < o.line;
  }
  const pickWords = (code, fx) => ({ 1: `${fx.h} to win`, 2: `${fx.a} to win`, '1X': `${fx.h} or draw`, X2: `${fx.a} or draw` }[code]);
  const cleanAdvice = (s) => String(s || '').replace(/\s*:\s*/g, ': ').replace(/\s+/g, ' ').trim();
  const countryLabel = (c) => (!c || c === 'World' ? 'International' : String(c).replace(/-/g, ' '));
  const initials = (name) => {
    const w = String(name || '?').replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
    if (!w.length) return '?';
    return (w.length === 1 ? w[0].slice(0, 3) : w[0][0] + w[1][0]).toUpperCase();
  };

  // ---------------------------------------------------------------- sample data (shown in "sample data" mode, never saved)
  const DEMO = [
    { id: 39, n: 'Premier League', c: 'England', t: ['Arsenal', 'Chelsea', 'Liverpool', 'Manchester City', 'Manchester United', 'Tottenham', 'Newcastle', 'Aston Villa', 'Brighton', 'West Ham', 'Everton', 'Fulham', 'Brentford', 'Crystal Palace', 'Bournemouth', 'Nottingham Forest'] },
    { id: 140, n: 'La Liga', c: 'Spain', t: ['Real Madrid', 'Barcelona', 'Atletico Madrid', 'Sevilla', 'Valencia', 'Villarreal', 'Real Sociedad', 'Athletic Club', 'Real Betis', 'Celta Vigo', 'Getafe', 'Osasuna'] },
    { id: 135, n: 'Serie A', c: 'Italy', t: ['Inter', 'AC Milan', 'Juventus', 'Napoli', 'AS Roma', 'Lazio', 'Atalanta', 'Fiorentina', 'Bologna', 'Torino'] },
    { id: 78, n: 'Bundesliga', c: 'Germany', t: ['Bayern München', 'Borussia Dortmund', 'RB Leipzig', 'Bayer Leverkusen', 'Eintracht Frankfurt', 'VfB Stuttgart', 'SC Freiburg', 'VfL Wolfsburg'] },
    { id: 61, n: 'Ligue 1', c: 'France', t: ['Paris Saint Germain', 'Marseille', 'Lyon', 'Monaco', 'Lille', 'Nice', 'Lens', 'Rennes'] },
    { id: 2, n: 'UEFA Champions League', c: 'World', days: [2, 3], t: ['Real Madrid', 'Barcelona', 'Bayern München', 'Manchester City', 'Arsenal', 'Liverpool', 'Inter', 'Paris Saint Germain', 'Borussia Dortmund', 'Atletico Madrid', 'Juventus', 'Benfica', 'PSV Eindhoven', 'Napoli', 'Sporting CP', 'Club Brugge'] },
    { id: 203, n: 'Süper Lig', c: 'Turkey', t: ['Galatasaray', 'Fenerbahçe', 'Beşiktaş', 'Trabzonspor', 'Başakşehir', 'Konyaspor'] },
    { id: 307, n: 'Pro League', c: 'Saudi-Arabia', t: ['Al-Hilal', 'Al-Nassr', 'Al-Ittihad', 'Al-Ahli', 'Al-Shabab', 'Al-Ettifaq'] },
    { id: 71, n: 'Serie A', c: 'Brazil', t: ['Flamengo', 'Palmeiras', 'Corinthians', 'São Paulo', 'Fluminense', 'Botafogo'] },
  ];
  const demoTeamId = (name) => (hashStr(name) % 900000) + 1000;
  function demoCore(id) {
    const r = rng(id);
    let h = 18 + r() * 52, a = 12 + r() * 46, d = 18 + r() * 18;
    const s = h + a + d;
    h = Math.round((h / s) * 100); a = Math.round((a / s) * 100); d = 100 - h - a;
    return { r, h, d, a };
  }
  function poisson(r, lam) { const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= r(); } while (p > L && k < 12); return k - 1; }
  const demoDays = new Map();
  function demoDay(date) {
    if (demoDays.has(date)) return demoDays.get(date);
    const r = rng(hashStr('day' + date));
    const base = parseYmd(date), dow = base.getDay(), weekend = dow === 0 || dow === 6;
    const f = [], L = {};
    for (const lg of DEMO) {
      let n;
      if (lg.days) n = lg.days.includes(dow) ? 4 + Math.floor(r() * 3) : 0;
      else n = weekend ? 3 + Math.floor(r() * 3) : r() < 0.42 ? 1 + Math.floor(r() * 2) : 0;
      if (lg.id === 39 && !weekend && n === 0 && !f.length) n = 2;
      const teams = lg.t.slice();
      for (let i = teams.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [teams[i], teams[j]] = [teams[j], teams[i]]; }
      n = Math.min(n, Math.floor(teams.length / 2));
      if (!n) continue;
      L[lg.id] = { n: lg.n, c: lg.c, logo: '', flag: '' };
      const slots = lg.days ? [17.75, 20, 20] : weekend ? [13.5, 15, 16, 16, 17.5, 18.5, 20.75] : [18.5, 19.5, 20, 20.75];
      for (let i = 0; i < n; i++) {
        const hour = slots[Math.floor(r() * slots.length)];
        const k = new Date(base); k.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
        const id = (hashStr(`${date}|${lg.id}|${i}`) % 90000000) + 10000000;
        const c = demoCore(id), gr = rng(id ^ 0x9e3779b9);
        const fgh = poisson(gr, 0.45 + c.h / 38), fga = poisson(gr, 0.35 + c.a / 44);
        const ts = k.getTime(), now = Date.now();
        let st = 'NS', el = null, gh = null, ga = null;
        if (now > ts + 112 * 60000) { st = 'FT'; gh = fgh; ga = fga; } else if (now > ts) {
          const m = Math.floor((now - ts) / 60000);
          st = m < 46 ? '1H' : m < 61 ? 'HT' : '2H';
          el = m < 46 ? Math.max(1, m) : m < 61 ? 45 : Math.min(90, m - 15);
          const part = Math.min(1, el / 90);
          gh = Math.floor(fgh * part); ga = Math.floor(fga * part);
        }
        f.push({ id, ts: Math.floor(ts / 1000), st, el, lg: lg.id, rd: 'Regular Season', hid: demoTeamId(teams[2 * i]), h: teams[2 * i], hl: '', aid: demoTeamId(teams[2 * i + 1]), a: teams[2 * i + 1], al: '', gh, ga });
      }
    }
    const day = { t: Date.now(), f, L, demo: true };
    demoDays.set(date, day);
    return day;
  }
  function demoPrediction(fx) {
    const { r, h, d, a } = demoCore(fx.id);
    const homeFav = h >= a, wod = Math.max(h, a) < 50;
    const name = homeFav ? fx.h : fx.a;
    const line = [1.5, 2.5, 2.5, 3.5][Math.floor(r() * 4)];
    const over = line === 1.5 ? r() < 0.8 : line === 3.5 ? r() < 0.2 : r() < 0.5;
    const pair = () => { const x = Math.round(25 + r() * 50); return [x, 100 - x]; };
    const form = () => Array.from({ length: 5 }, () => 'WWDL'[Math.floor(r() * 4)]).join('');
    const h2h = Array.from({ length: 5 }, (_, i) => {
      const flip = r() < 0.5;
      return { d: `${2025 - i}-${pad(1 + Math.floor(r() * 12))}-${pad(1 + Math.floor(r() * 27))}`, h: flip ? fx.a : fx.h, a: flip ? fx.h : fx.a, gh: Math.floor(r() * 4), ga: Math.floor(r() * 3) };
    });
    const adv = wod ? `Double chance : ${name} or draw` : r() < 0.5 ? `Winner : ${name}` : `Combo Winner : ${name} and target ${over ? 'Over' : 'Under'} ${line}`;
    return {
      w: { id: homeFav ? fx.hid : fx.aid, n: name, c: wod ? 'Win or draw' : '' }, wod,
      uo: `${over ? '+' : '-'}${line}`, gh: `-${(1.5 + Math.floor(r() * 2)).toFixed(1)}`, ga: `-${(0.5 + Math.floor(r() * 2)).toFixed(1)}`,
      adv, ph: h, pd: d, pa: a,
      cmp: { form: pair(), att: pair(), def: pair(), poisson_distribution: pair(), h2h: pair(), goals: pair(), total: homeFav ? [Math.max(h, 52), 100 - Math.max(h, 52)] : [Math.min(h, 48), 100 - Math.min(h, 48)] },
      fh: form(), fa: form(), h2h, t: Date.now(), demo: true,
    };
  }

  // ---------------------------------------------------------------- data access
  const dayKey = (d) => `md:day:${d}`;
  function getDay(date) {
    if (S.demo) return demoDay(date);
    if (memDays.has(date)) return memDays.get(date);
    const d = store.get(dayKey(date), null);
    if (d && Array.isArray(d.f)) { memDays.set(date, d); return d; }
    return null;
  }
  const hasDay = (date) => (S.demo ? true : memDays.has(date) || store.has(dayKey(date)));
  function getPred(fx) {
    if (!fx) return null;
    if (S.demo) return myLeagues().includes(fx.lg) || S.demoReq.has(fx.id) ? demoPrediction(fx) : null;
    if (memPreds.has(fx.id)) return memPreds.get(fx.id);
    const p = store.get(`md:p:${fx.id}`, null);
    if (p) memPreds.set(fx.id, p);
    return p;
  }
  function setPred(id, p) { memPreds.set(id, p); store.set(`md:p:${id}`, p); }
  const findFx = (id) => { const d = getDay(S.date); return d ? d.f.find((x) => x.id === id) || null : null; };
  function needsPred(fx) {
    const p = getPred(fx);
    if (!p) return true;
    const age = Date.now() - (p.t || 0);
    if (fx.st === 'NS' || fx.st === 'TBD') return age > (p.none ? 6 : 24) * 3600e3;
    return false;
  }
  function dayStale(date, day) {
    if (!day) return true;
    const age = Date.now() - (day.t || 0);
    if (date < S.today) {
      const settled = day.f.every((x) => FIN.has(x.st) || OFF.has(x.st));
      const fetchedAfter = day.t > parseYmd(addDays(date, 1)).getTime() + 3 * 3600e3;
      return !(settled || fetchedAfter) && age > 30 * 60e3;
    }
    if (date === S.today) return age > 10 * 60e3;
    return age > 6 * 3600e3;
  }

  // ---------------------------------------------------------------- API + request queue (keeps to the per-minute limit)
  class ApiError extends Error { constructor(kind, msg) { super(msg); this.kind = kind; } }
  function errorInfo(errors) {
    if (!errors) return null;
    if (Array.isArray(errors)) return errors.length ? { kind: 'api', msg: errors.map(String).join(' ') } : null;
    if (typeof errors !== 'object') return { kind: 'api', msg: String(errors) };
    const keys = Object.keys(errors);
    if (!keys.length) return null;
    const msg = keys.map((k) => String(errors[k])).join(' ');
    const k = keys.join(' ').toLowerCase();
    const kind = k.includes('ratelimit') ? 'rate' : k.includes('requests') ? 'quota' : k.includes('token') || k.includes('access') ? 'key' : k.includes('plan') ? 'plan' : k.includes('timezone') ? 'tz' : 'api';
    return { kind, msg };
  }
  async function apiGet(path, params = {}) {
    const key = getKey();
    if (!key) throw new ApiError('key', 'Add your free API key in Settings.');
    const qs = new URLSearchParams(params).toString();
    let res;
    try {
      res = await fetch(`${API}${path}${qs ? `?${qs}` : ''}`, { headers: { 'x-apisports-key': key }, cache: 'no-store' });
    } catch {
      throw new ApiError('net', navigator.onLine ? "Couldn't reach the football data service." : "You're offline.");
    }
    setUsage(usage() + 1); // every call counts toward the daily limit, /status included
    if (res.status === 429) throw new ApiError('rate', 'Too many requests at once.');
    let data;
    try { data = await res.json(); } catch { throw new ApiError('api', `Unexpected reply from the server (${res.status}).`); }
    const e = errorInfo(data && data.errors);
    if (e) throw new ApiError(e.kind, e.msg);
    if (!res.ok) throw new ApiError('api', `Server error (${res.status}).`);
    return data;
  }

  const Q = { items: [], busy: false, stamps: [], pauseUntil: 0, current: null };
  function enqueue(job, front = false) {
    return new Promise((resolve, reject) => {
      const j = Object.assign({}, job, { resolve, reject, tries: 0 });
      if (front) Q.items.unshift(j); else Q.items.push(j);
      pump();
    });
  }
  function dropQueued(test) {
    Q.items = Q.items.filter((j) => { if (test(j)) { j.reject(new ApiError('cancel', '')); return false; } return true; });
    renderProgress();
  }
  async function pump() {
    if (Q.busy) return;
    Q.busy = true;
    try {
      while (Q.items.length) {
        const now = Date.now();
        Q.stamps = Q.stamps.filter((t) => now - t < 60000);
        let wait = Q.pauseUntil - now;
        if (wait <= 0 && Q.stamps.length >= PER_MIN) wait = 60000 - (now - Q.stamps[0]) + 300;
        const was = S.waiting;
        S.waiting = wait > 0;
        if (was !== S.waiting) renderProgress();
        if (wait > 0) { await sleep(Math.min(wait, 1000)); continue; }
        const j = Q.items.shift();
        Q.current = j;
        Q.stamps.push(Date.now());
        try { j.resolve(await j.run()); } catch (e) {
          if (e.kind === 'rate' && j.tries < 3) { j.tries++; Q.pauseUntil = Date.now() + 61000; Q.items.unshift(j); } else j.reject(e);
        }
        Q.current = null;
      }
    } finally {
      Q.busy = false; S.waiting = false; renderProgress();
    }
  }
  const queuedFor = (date) => Q.items.filter((j) => j.kind === 'pred' && j.tag === date).length + (Q.current && Q.current.kind === 'pred' && Q.current.tag === date ? 1 : 0);

  function onApiError(e) {
    if (!e || e.kind === 'cancel') return;
    if (['key', 'quota', 'plan', 'net'].includes(e.kind)) dropQueued(() => true);
    if (e.kind === 'quota') setUsage(getLimit());
    const text = {
      key: "Your API key wasn't accepted. Check it in Settings.",
      quota: `You've used all of today's free requests. More from ${resetTimeText()}.`,
      plan: `Your API-Football plan can't load this: ${e.message}`,
      net: `${e.message} Showing saved data.`,
    }[e.kind] || e.message;
    setBanner(e.kind === 'net' ? 'info' : 'error', text, e.kind === 'key' ? { label: 'Open Settings', act: 'settings' } : null, e.kind);
  }
  function setBanner(kind, text, action = null, tag = '') { S.banner = { kind, text, action, tag }; renderBanner(); }
  function clearBanner(tag) { if (S.banner && (!tag || S.banner.tag === tag)) { S.banner = null; renderBanner(); } }

  async function fetchDay(date) {
    const params = { date };
    if (TZ && !S.noTz) params.timezone = TZ;
    let data;
    try {
      data = await enqueue({ kind: 'day', tag: date, run: () => apiGet('/fixtures', params) }, true);
    } catch (e) {
      if (e.kind === 'tz' && !S.noTz) { S.noTz = true; return fetchDay(date); }
      throw e;
    }
    const f = [], L = {};
    for (const x of data.response || []) {
      try {
        const fx = slimFixture(x);
        if (!fx.id) continue;
        f.push(fx);
        const lg = x.league;
        if (lg && !L[lg.id]) L[lg.id] = { n: lg.name || '', c: lg.country || '', logo: lg.logo || '', flag: lg.flag || '' };
      } catch { /* skip odd rows */ }
    }
    const day = { t: Date.now(), f, L };
    memDays.set(date, day);
    store.set(dayKey(date), day);
    return day;
  }

  async function loadDay(date, force = false) {
    if (S.demo || !getKey()) { renderAll(); return; }
    dropQueued((j) => !j.manual && j.tag !== date);
    const day = getDay(date);
    if (force || dayStale(date, day)) {
      if (!navigator.onLine) { if (!day) renderAll(); setBanner('info', "You're offline. Showing saved data.", null, 'net'); return; }
      S.loadingDay = date;
      if (date === S.date) renderAll();
      try { await fetchDay(date); clearBanner('net'); if (S.banner && S.banner.tag === 'api') clearBanner(); } catch (e) { onApiError(e); }
      if (S.loadingDay === date) S.loadingDay = null;
    }
    if (date !== S.date) return;
    renderAll();
    scheduleTips(date);
  }

  function scheduleTips(date, all = false) {
    if (S.demo || !getKey()) return;
    const day = getDay(date);
    if (!day) return;
    if (date < S.today && !all) { renderList(); return; }
    const mine = new Set(myLeagues());
    const need = day.f
      .filter((fx) => mine.has(fx.lg) && !OFF.has(fx.st) && !S.pending.has(fx.id) && needsPred(fx))
      .sort((a, b) => a.ts - b.ts || a.id - b.id);
    const room = Math.max(0, remaining() - RESERVE - Q.items.length);
    const take = need.slice(0, room);
    S.held[date] = need.length - take.length;
    take.forEach((fx) => queuePred(fx, date));
    renderProgress();
    if (take.length || S.held[date]) renderList();
  }
  // opts.manual: a tap on one match (goes first). opts.bulk: part of "Get all tips" (survives changing day, can be stopped).
  function queuePred(fx, date, opts = {}) {
    if (S.pending.has(fx.id)) return;
    const manual = !!opts.manual, bulk = !!opts.bulk;
    S.pending.add(fx.id);
    updateRow(fx.id);
    enqueue({ kind: 'pred', tag: date, manual: manual || bulk, bulk, run: () => apiGet('/predictions', { fixture: fx.id }) }, manual)
      .then((data) => {
        const r = (data.response || [])[0];
        setPred(fx.id, r ? slimPrediction(r) : { none: true, t: Date.now() });
      })
      .catch(onApiError)
      .finally(() => {
        S.pending.delete(fx.id);
        updateRow(fx.id);
        renderProgress();
        if (S.sheet && S.sheet.type === 'match' && S.sheet.id === fx.id) renderSheet();
        if (date === S.date && !queuedFor(date)) renderList(); // refresh the tips bar once everything has arrived
      });
    renderProgress();
  }
  function requestTip(id) {
    const fx = findFx(id);
    if (!fx) return;
    if (S.demo) {
      S.pending.add(id); updateRow(id); refreshSheetFor(id);
      setTimeout(() => { S.demoReq.add(id); S.pending.delete(id); updateRow(id); refreshSheetFor(id); }, 500);
      return;
    }
    if (!getKey()) { openSheet({ type: 'settings' }); return; }
    if (remaining() <= 0) { onApiError(new ApiError('quota', '')); return; }
    queuePred(fx, S.date, { manual: true });
    refreshSheetFor(id);
  }
  // "Get all tips": every match of the selected day, as far as today's free requests allow.
  function getAllTips(onlyMine = false) {
    const date = S.date, day = getDay(date);
    if (!day) return;
    const mine = new Set(myLeagues());
    const need = day.f
      .filter((fx) => (!onlyMine || mine.has(fx.lg)) && !OFF.has(fx.st) && !S.pending.has(fx.id) && needsPred(fx))
      .sort((a, b) => (mine.has(b.lg) - mine.has(a.lg)) || (FIN.has(a.st) - FIN.has(b.st)) || a.ts - b.ts || a.id - b.id);
    if (!need.length) return;
    if (S.demo) {
      need.forEach((fx) => S.demoReq.add(fx.id));
      if (!onlyMine) expandAll(day);
      renderAll();
      return;
    }
    if (!getKey()) { openSheet({ type: 'settings' }); return; }
    const left = remaining(), room = Math.max(0, left - RESERVE - Q.items.length);
    if (!room) { onApiError(new ApiError('quota', '')); return; }
    const take = need.slice(0, room);
    const mins = plural(Math.max(1, Math.ceil(take.length / PER_MIN)), 'minute');
    const msg = take.length === need.length
      ? `Get tips for ${plural(take.length, 'match', 'matches')}?\n\nThis uses ${take.length} of your ${left} free requests left today and takes about ${mins}. Keep the app open while they load.`
      : `You have ${left} free requests left today: enough for ${take.length} of these ${need.length} matches (${RESERVE} are kept spare).\n\nGet those ${take.length} now? Your leagues and the earliest matches go first. It takes about ${mins}. Keep the app open while they load.`;
    if (!window.confirm(msg)) return;
    S.held[date] = need.length - take.length;
    take.forEach((fx) => queuePred(fx, date, { bulk: true }));
    if (!onlyMine) expandAll(day);
    renderAll();
  }
  function expandAll(day) {
    S.view = 'all';
    store.set('md:view', 'all');
    for (const fx of day.f) S.expanded.add(fx.lg);
  }
  function stopTips() {
    dropQueued((j) => j.bulk);
    renderAll();
  }
  const refreshSheetFor = (id) => { if (S.sheet && S.sheet.type === 'match' && S.sheet.id === id) renderSheet(); };

  async function refreshStatus() {
    if (S.demo || !getKey()) return null;
    try {
      const data = await apiGet('/status');
      const r = data.response && !Array.isArray(data.response) ? data.response : {};
      const req = r.requests || {}, sub = r.subscription || {};
      if (Number.isFinite(req.current)) setUsage(req.current);
      if (req.limit_day) store.set('md:limit', req.limit_day);
      store.set('md:statusAt', Date.now());
      S.status = { ok: true, plan: sub.plan || '', active: sub.active !== false, used: req.current, limit: req.limit_day, t: Date.now() };
    } catch (e) {
      S.status = { ok: false, kind: e.kind, msg: e.message, t: Date.now() };
    }
    return S.status;
  }

  // ---------------------------------------------------------------- rendering: header
  function weekStart(s) { const d = parseYmd(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); }
  function renderHeader() {
    $('#monthLabel').textContent = fmt({ month: 'long', year: 'numeric' }, parseYmd(S.date));
    $('#monthBtn').setAttribute('aria-expanded', String(S.monthOpen));
    $('#todayBtn').hidden = S.date === S.today;
    const start = weekStart(S.date);
    let h = `<button class="wk-arrow" data-shift="-7" aria-label="Previous week">${ICON.chevLeft}</button>`;
    for (let i = 0; i < 7; i++) {
      const ds = addDays(start, i), d = parseYmd(ds);
      h += `<button class="wd${ds === S.date ? ' sel' : ''}${ds === S.today ? ' today' : ''}" data-date="${ds}" aria-pressed="${ds === S.date}" aria-label="${esc(fmt({ weekday: 'long', day: 'numeric', month: 'long' }, d))}">
        <span class="wd-name">${esc(fmt({ weekday: 'short' }, d))}</span><span class="wd-num">${d.getDate()}</span><span class="wd-dot${!S.demo && hasDay(ds) ? ' on' : ''}"></span></button>`;
    }
    h += `<button class="wk-arrow" data-shift="7" aria-label="Next week">${ICON.chevRight}</button>`;
    $('#week').innerHTML = h;
    $('#week').hidden = S.monthOpen;
    renderMonth();
  }
  function renderMonth() {
    const el = $('#month');
    el.hidden = !S.monthOpen;
    if (!S.monthOpen) { el.innerHTML = ''; return; }
    const c = S.monthCursor, y = c.getFullYear(), m = c.getMonth();
    const lead = (new Date(y, m, 1).getDay() + 6) % 7, n = new Date(y, m + 1, 0).getDate();
    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<span></span>';
    for (let d = 1; d <= n; d++) {
      const ds = ymd(new Date(y, m, d));
      cells += `<button class="md${ds === S.date ? ' sel' : ''}${ds === S.today ? ' today' : ''}${!S.demo && hasDay(ds) ? ' has' : ''}" data-date="${ds}" aria-label="${esc(fmt({ weekday: 'long', day: 'numeric', month: 'long' }, new Date(y, m, d)))}">${d}</button>`;
    }
    const dows = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((x) => `<span>${x}</span>`).join('');
    el.innerHTML = `<div class="m-head"><button class="icon-btn" data-month="-1" aria-label="Previous month">${ICON.chevLeft}</button><b>${esc(fmt({ month: 'long', year: 'numeric' }, c))}</b><button class="icon-btn" data-month="1" aria-label="Next month">${ICON.chevRight}</button></div>
      <div class="m-dows">${dows}</div><div class="m-grid">${cells}</div>
      <div class="m-foot"><button data-date="${S.today}">Go to today</button></div>`;
  }

  // ---------------------------------------------------------------- rendering: day
  function renderDayHead() {
    const d = parseYmd(S.date);
    const rel = S.date === S.today ? 'Today' : S.date === addDays(S.today, 1) ? 'Tomorrow' : S.date === addDays(S.today, -1) ? 'Yesterday' : '';
    const year = d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined;
    $('#dayTitle').textContent = rel || fmt({ weekday: 'long' }, d);
    $('#daySub').textContent = rel ? fmt({ weekday: 'long', day: 'numeric', month: 'long', year }, d) : fmt({ day: 'numeric', month: 'long', year }, d);
    const welcome = !S.demo && !getKey();
    $('#seg').classList.toggle('hide', welcome);
    for (const b of document.querySelectorAll('#seg button')) b.setAttribute('aria-selected', String(b.dataset.view === S.view));
    const day = getDay(S.date);
    const mine = new Set(myLeagues());
    $('#nMine').textContent = day ? day.f.filter((x) => mine.has(x.lg)).length : '';
    $('#nAll').textContent = day ? day.f.length : '';
    $('#searchWrap').hidden = welcome || S.view !== 'all';
  }
  function renderBanner() {
    const el = $('#banner');
    let b = S.banner;
    if (!b && S.demo) b = { kind: 'demo', text: 'Sample data: these matches and tips are made up.', action: { label: 'Use real data', act: 'settings' }, fixed: true };
    if (!b) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="banner ${esc(b.kind)}" role="status"><div class="b-text">${esc(b.text)}${b.action ? ` <button class="b-act" data-act="${esc(b.action.act)}">${esc(b.action.label)}</button>` : ''}</div>${b.fixed ? '' : `<button class="b-x" data-act="dismiss-banner" aria-label="Dismiss">${ICON.close}</button>`}</div>`;
  }
  function renderProgress() {
    const el = $('#progress');
    if (!el) return;
    const n = queuedFor(S.date);
    const bulk = Q.items.some((j) => j.bulk);
    const eta = n > PER_MIN ? ` · about ${Math.ceil(n / PER_MIN)} min` : '';
    el.innerHTML = n
      ? `<div class="progress"><span class="spin"></span><span>Getting tips · ${n} to go${eta}${S.waiting ? ' <span class="muted">· free plan allows 10 a minute</span>' : ''}</span>${bulk ? '<button class="p-stop" data-act="stop-tips">Stop</button>' : ''}</div>`
      : '';
    const busy = S.loadingDay === S.date;
    $('#refreshBtn').classList.toggle('spinning', busy);
  }

  function groupsFor(day) {
    const mineList = myLeagues(), mine = new Set(mineList), q = norm(S.query.trim());
    const groups = new Map();
    for (const fx of day.f) {
      const inMine = mine.has(fx.lg);
      if (S.view === 'mine' && !inMine) continue;
      if (q && S.view === 'all') {
        const L = day.L[fx.lg] || {};
        if (!norm(`${fx.h} ${fx.a} ${L.n || ''} ${L.c || ''} ${countryLabel(L.c)}`).includes(q)) continue;
      }
      if (!groups.has(fx.lg)) groups.set(fx.lg, []);
      groups.get(fx.lg).push(fx);
    }
    const arr = [...groups.entries()].map(([id, list]) => ({
      id, L: day.L[id] || leagueInfo(id), mine: mine.has(id), list: list.sort((a, b) => a.ts - b.ts || a.id - b.id),
    }));
    const cKey = (g) => (!g.L.c || g.L.c === 'World' ? ' ' : g.L.c);
    arr.sort((a, b) => {
      if (a.mine !== b.mine) return a.mine ? -1 : 1;
      if (a.mine) return mineList.indexOf(a.id) - mineList.indexOf(b.id);
      return cKey(a).localeCompare(cKey(b)) || a.id - b.id;
    });
    return arr;
  }
  function logoHTML(url, name, cls = 'logo') {
    if (url) return `<img class="${cls}" src="${esc(url)}" alt="" loading="lazy" decoding="async" data-name="${esc(name)}">`;
    return `<span class="${cls} ini" style="--h:${hashStr(name) % 360}" aria-hidden="true">${esc(initials(name))}</span>`;
  }
  function leagueLogoHTML(L) {
    return L && L.logo ? `<img class="lg-logo" src="${esc(L.logo)}" alt="" loading="lazy" decoding="async">` : `<span class="lg-logo ph" aria-hidden="true">${ICON.trophy}</span>`;
  }
  function tipHTML(fx, p, st) {
    if (st.kind === 'off') return '<span class="no-tip">—</span>';
    if (S.pending.has(fx.id)) return '<span class="pick skel" aria-label="Loading tip"></span><span class="skel skel-line" style="width:40px;height:14px;margin:0"></span>';
    if (!p) return `<button class="get-tip" data-tip="${fx.id}" aria-label="Get tip for ${esc(fx.h)} vs ${esc(fx.a)}">Tip</button>`;
    const pk = pickOf(fx, p), ou = parseOU(p.uo);
    if (!pk && !ou) return '<span class="no-tip">No tip</span>';
    let h = '';
    if (pk) {
      const ok = judgePick(pk.code, fx);
      h += `<span class="pick${ok === true ? ' win' : ok === false ? ' lose' : ''}"><b>${pk.code}</b>${pk.conf != null ? `<small>${pk.conf}%</small>` : ''}${ok == null ? '' : `<span class="mark">${ok ? ICON.check : ICON.cross}</span>`}</span>`;
    }
    if (ou) { const ok = judgeOU(ou, fx); h += `<span class="ou${ok === true ? ' win' : ok === false ? ' lose' : ''}">${ouLabel(ou)}</span>`; }
    return h;
  }
  function probHTML(p) {
    if (!p || p.none || p.ph == null || p.pd == null || p.pa == null) return '<div class="prob no-data"></div>';
    return `<div class="prob" title="Home ${p.ph}% · Draw ${p.pd}% · Away ${p.pa}%"><i class="h" style="flex:${p.ph}"></i><i class="d" style="flex:${p.pd}"></i><i class="a" style="flex:${p.pa}"></i></div>`;
  }
  function rowHTML(fx) {
    const p = getPred(fx), st = statusInfo(fx);
    const showScore = (st.kind === 'fin' || st.kind === 'live') && fx.gh != null;
    const fin = st.kind === 'fin' && fx.gh != null;
    const hw = fin && fx.gh > fx.ga, aw = fin && fx.ga > fx.gh;
    const time = st.kind === 'live'
      ? `<div class="m-time live"><span class="dot"></span>${esc(st.label)}</div>`
      : st.kind === 'fin' ? `<div class="m-time fin">${esc(st.label)}<small>${fmtTime(fx.ts)}</small></div>`
        : st.kind === 'off' ? `<div class="m-time"><small>${esc(st.label)}</small></div>`
          : `<div class="m-time">${esc(st.label)}</div>`;
    const team = (name, logo, score, won, lost) => `<div class="team${won ? ' won' : ''}${lost ? ' lost' : ''}">${logoHTML(logo, name)}<span class="name">${esc(name)}</span>${showScore ? `<span class="score">${esc(score)}</span>` : ''}</div>`;
    return `<div class="match ${st.kind}" role="button" tabindex="0" data-id="${fx.id}" aria-label="${esc(`${fx.h} vs ${fx.a}`)}">
      ${time}
      <div class="m-teams">${team(fx.h, fx.hl, fx.gh, hw, aw)}${team(fx.a, fx.al, fx.ga, aw, hw)}${probHTML(p)}</div>
      <div class="m-tip">${tipHTML(fx, p, st)}</div>
    </div>`;
  }
  function updateRow(id) {
    const el = document.querySelector(`.match[data-id="${id}"]`);
    const fx = findFx(id);
    if (el && fx) el.outerHTML = rowHTML(fx);
  }
  function groupHTML(g) {
    const collapsible = S.view === 'all';
    const open = !collapsible || !!S.query.trim() || S.expanded.has(g.id);
    const headAttrs = collapsible ? ` role="button" tabindex="0" data-toggle="${g.id}" aria-expanded="${open}"` : '';
    const star = collapsible ? `<button class="star${g.mine ? ' on' : ''}" data-star="${g.id}" aria-pressed="${g.mine}" aria-label="${g.mine ? 'Remove from' : 'Add to'} my leagues">${ICON.star}</button>` : '';
    return `<section class="league${open ? ' open' : ''}">
      <div class="lg-head"${headAttrs}>${leagueLogoHTML(g.L)}<div class="lg-name"><b>${esc(g.L.n)}</b><span>${esc(countryLabel(g.L.c))}</span></div><span class="lg-count">${g.list.length}</span>${star}${collapsible ? `<span class="chev">${ICON.chevDown}</span>` : ''}</div>
      ${open ? g.list.map(rowHTML).join('') : ''}
    </section>`;
  }
  function skeletonHTML() {
    const row = '<div class="match"><div class="m-time"><span class="skel skel-line" style="width:34px"></span></div><div class="m-teams"><div class="skel skel-line" style="width:70%"></div><div class="skel skel-line" style="width:55%"></div></div><div class="m-tip"><span class="pick skel"></span></div></div>';
    return `<section class="league"><div class="lg-head"><span class="lg-logo ph"></span><div class="lg-name"><span class="skel skel-line" style="width:140px"></span></div></div>${row.repeat(4)}</section>`;
  }
  function emptyHTML(title, text = '', action = null) {
    return `<div class="empty"><b>${esc(title)}</b>${text ? `<span>${esc(text)}</span>` : ''}${action ? `<br><button class="btn small primary" data-act="${esc(action.act)}">${esc(action.label)}</button>` : ''}</div>`;
  }
  function welcomeHTML() {
    if (DEFAULT_KEY) {
      return `<div class="welcome">
        <div class="w-icon">${ICON.ball}</div>
        <h2>One tap to start</h2>
        <p>Your API-Football key is already filled in. Open Settings and tap <b>Save</b>, and today's matches and tips will load.</p>
        <button class="btn primary" data-act="settings">Open Settings</button>
        <button class="btn" data-act="demo-on">Look around with sample matches</button>
      </div>`;
    }
    return `<div class="welcome">
      <div class="w-icon">${ICON.ball}</div>
      <h2>Set up your free predictions</h2>
      <p>Matches and tips come from API-Football. Their free plan is enough for daily use, and it doesn't need a card.</p>
      <ol class="steps">
        <li><b>Create a free account</b> at <a href="${SIGNUP_URL}" target="_blank" rel="noopener">dashboard.api-football.com</a>.</li>
        <li><b>Copy your API key</b> from the dashboard's home page.</li>
        <li><b>Paste it in Settings</b> here.</li>
      </ol>
      <p class="hint">On iPhone, do step 3 in the app on your Home Screen, not in Safari. The two keep separate storage.</p>
      <button class="btn primary" data-act="settings">Add my key</button>
      <button class="btn" data-act="demo-on">Look around with sample matches</button>
    </div>`;
  }
  function tipsBarHTML(day) {
    const live = day.f.filter((fx) => !OFF.has(fx.st));
    if (!live.length || queuedFor(S.date)) return '';
    const missing = live.filter((fx) => !getPred(fx) && !S.pending.has(fx.id));
    if (!missing.length) return '';
    const mine = new Set(myLeagues());
    const mineMissing = missing.filter((fx) => mine.has(fx.lg)).length;
    const past = S.date < S.today;
    const two = past && mineMissing > 0 && mineMissing < missing.length;
    const sub = past ? 'Past days load tips only when you ask.' : 'Tips for your leagues load by themselves.';
    return `<div class="tipsbar${two ? ' two' : ''}"><div class="tb-text"><b>Tips for ${live.length - missing.length} of ${plural(live.length, 'match', 'matches')}</b><span>${sub}</span></div>
      <div class="tb-btns">${two ? `<button class="btn small" data-act="past-tips">My leagues (${mineMissing})</button>` : ''}<button class="btn small primary" data-act="all-tips">Get all tips</button></div></div>`;
  }
  function noticesHTML(day) {
    if (!S.demo && !getKey()) return '';
    let h = tipsBarHTML(day);
    if (S.demo) return h;
    const held = S.held[S.date] || 0;
    if (held && !queuedFor(S.date)) {
      h += `<div class="notice warn"><div><b>${plural(held, 'tip')} not loaded</b><span>That keeps you inside today's free limit. Tap “Tip” on a match, remove leagues in Settings, or check back after ${resetTimeText()}.</span></div></div>`;
    }
    return h;
  }
  function renderList() {
    const el = $('#list');
    if (!S.demo && !getKey()) { el.innerHTML = welcomeHTML(); return; }
    const day = getDay(S.date);
    if (!day) {
      el.innerHTML = S.loadingDay === S.date ? skeletonHTML()
        : emptyHTML(navigator.onLine ? "Couldn't load this day" : 'No saved matches for this day', navigator.onLine ? '' : 'Connect to the internet to load them.', navigator.onLine ? { label: 'Try again', act: 'refresh' } : null);
      return;
    }
    const groups = groupsFor(day);
    let html = noticesHTML(day);
    if (!groups.length) {
      if (S.view === 'mine') {
        html += day.f.length
          ? emptyHTML('No matches in your leagues', `There ${day.f.length === 1 ? 'is 1 other match' : `are ${day.f.length} other matches`} on this day.`, { label: 'Show all matches', act: 'show-all' })
          : emptyHTML('No matches on this day');
      } else html += emptyHTML(S.query.trim() ? 'Nothing matches your search' : 'No matches on this day');
    } else html += groups.map(groupHTML).join('');
    el.innerHTML = html;
  }
  function renderAll() {
    renderHeader();
    renderDayHead();
    renderBanner();
    renderProgress();
    renderList();
  }

  // ---------------------------------------------------------------- sheets (match details, settings)
  function openSheet(sheet) {
    S.sheet = sheet;
    renderSheet();
    const w = $('#sheetWrap');
    w.hidden = false;
    document.documentElement.classList.add('locked');
    requestAnimationFrame(() => requestAnimationFrame(() => w.classList.add('open')));
    $('#sheetBody').scrollTop = 0;
  }
  function closeSheet() {
    const w = $('#sheetWrap');
    if (w.hidden) return;
    S.sheet = null;
    w.classList.remove('open');
    document.documentElement.classList.remove('locked');
    setTimeout(() => { if (!S.sheet) { w.hidden = true; $('#sheetBody').innerHTML = ''; } }, 320);
  }
  function renderSheet() {
    if (!S.sheet) return;
    const body = $('#sheetBody');
    if (S.sheet.type === 'settings') body.innerHTML = settingsHTML();
    else {
      const fx = findFx(S.sheet.id);
      if (!fx) { closeSheet(); return; }
      body.innerHTML = matchHTML(fx);
    }
  }
  const CMP_LABELS = { form: 'Form', att: 'Attack', def: 'Defence', poisson_distribution: 'Goal model', h2h: 'Head to head', goals: 'Goals', total: 'Overall' };
  function matchHTML(fx) {
    const day = getDay(S.date) || { L: {} }, L = day.L[fx.lg] || leagueInfo(fx.lg);
    const p = getPred(fx), st = statusInfo(fx), pk = pickOf(fx, p), ou = parseOU(p && p.uo);
    const showScore = (st.kind === 'fin' || st.kind === 'live') && fx.gh != null;
    const when = fmt({ weekday: 'short', day: 'numeric', month: 'short' }, new Date(fx.ts * 1000));
    let h = `<div class="sh-top">${leagueLogoHTML(L)}<div class="lg-name"><b>${esc(L.n)}</b><span>${esc([countryLabel(L.c), fx.rd].filter(Boolean).join(' · '))}</span></div><button class="close-btn" data-act="close-sheet" aria-label="Close">${ICON.close}</button></div>
      <div class="board">
        <div class="side">${logoHTML(fx.hl, fx.h)}<b>${esc(fx.h)}</b></div>
        <div class="mid"><span class="big">${showScore ? `${fx.gh} – ${fx.ga}` : st.kind === 'ns' ? esc(st.label) : '–'}</span><span class="st${st.kind === 'live' ? ' live' : ''}">${esc(st.kind === 'ns' ? when : st.kind === 'live' ? `Live · ${st.label}` : `${st.label} · ${when}`)}</span></div>
        <div class="side">${logoHTML(fx.al, fx.a)}<b>${esc(fx.a)}</b></div>
      </div>`;
    if (st.kind === 'off') return `${h}<div class="card2"><p style="margin:0">This match was ${{ PST: 'postponed', CANC: 'cancelled', ABD: 'abandoned' }[fx.st] || 'called off'}.</p></div>`;
    if (S.pending.has(fx.id)) return `${h}<div class="card2 best"><h3>Best tip</h3><div class="best-row"><div class="m-tip"><span class="pick skel"></span></div><div class="best-txt"><div><b>Getting the tip…</b><span>${S.waiting ? 'Waiting a moment: the free plan allows 10 requests a minute.' : 'One moment.'}</span></div></div></div></div>`;
    if (!p) {
      if (!S.demo && getKey() && remaining() <= 0) return `${h}<div class="card2"><h3>Best tip</h3><p style="margin:0;color:var(--muted);font-size:14px">You've used today's free requests, so this tip can't load yet. More from ${resetTimeText()}.</p></div>`;
      return `${h}<div class="card2"><h3>Best tip</h3><p style="margin:0 0 12px;color:var(--muted);font-size:14px">Not loaded yet.</p><button class="btn primary" data-tip="${fx.id}">Get the tip</button></div>`;
    }
    if (p.none || (!pk && !ou && !p.adv)) return `${h}<div class="card2"><h3>Best tip</h3><p style="margin:0">API-Football has no prediction for this match.</p></div>`;

    if (pk || ou) {
      // Same tip as the match row in the list (same pill and goals chip), explained in words.
      const okPick = pk ? judgePick(pk.code, fx) : null, okOU = judgeOU(ou, fx);
      const result = (ok) => (ok === true ? ' · Correct' : ok === false ? ' · Missed' : '');
      const lines = [];
      if (pk) lines.push(`<b>${esc(pickWords(pk.code, fx))}</b><span>${pk.conf != null ? `${pk.conf}% chance` : 'Main pick'}${result(okPick)}</span>`);
      if (ou) lines.push(`<b>${esc(ouWords(ou))}</b><span>In the match${result(okOU)}</span>`);
      h += `<div class="card2 best"><h3>Best tip</h3><div class="best-row"><div class="m-tip">${tipHTML(fx, p, st)}</div><div class="best-txt">${lines.map((l) => `<div>${l}</div>`).join('')}</div></div>
        ${p.adv ? `<p class="advice">${esc(cleanAdvice(p.adv))}</p>` : ''}</div>`;
    } else if (p.adv) h += `<div class="card2"><h3>Best tip</h3><p style="margin:0">${esc(cleanAdvice(p.adv))}</p></div>`;

    if (p.ph != null && p.pd != null && p.pa != null) {
      h += `<div class="card2"><h3>Win chances</h3><div class="chances">
        <div><span>${esc(fx.h)}</span><b>${p.ph}%</b><i style="background:var(--accent);width:${Math.max(4, p.ph)}%"></i></div>
        <div><span>Draw</span><b>${p.pd}%</b><i style="background:var(--draw);width:${Math.max(4, p.pd)}%"></i></div>
        <div><span>${esc(fx.a)}</span><b>${p.pa}%</b><i style="background:var(--away);width:${Math.max(4, p.pa)}%"></i></div></div></div>`;
    }
    const gH = parseOU(p.gh), gA = parseOU(p.ga);
    if (gH || gA) {
      h += `<div class="card2"><h3>Goals per team</h3><div class="chips">
        ${gH ? `<span class="chip">${esc(fx.h)}: ${esc(ouWords(gH).replace(' goals', ''))}</span>` : ''}
        ${gA ? `<span class="chip">${esc(fx.a)}: ${esc(ouWords(gA).replace(' goals', ''))}</span>` : ''}
      </div></div>`;
    }
    const keys = Object.keys(p.cmp || {});
    if (keys.length) {
      h += `<div class="card2"><h3>Comparison</h3><div class="cmp-legend"><span><i style="background:var(--accent)"></i>${esc(fx.h)}</span><span>${esc(fx.a)}<i style="background:var(--away)"></i></span></div><div class="cmp">${keys.map((k) => {
        const [a, b] = p.cmp[k];
        return `<div class="cmp-row"><span class="l">${esc(CMP_LABELS[k] || k)}</span><span class="v">${Math.round(a)}%</span><div class="cmp-bar"><i style="flex:${Math.max(a, 1)}"></i><i style="flex:${Math.max(b, 1)}"></i></div><span class="v">${Math.round(b)}%</span></div>`;
      }).join('')}</div></div>`;
    }
    if (p.fh || p.fa) {
      const chips = (f) => `<span class="form">${f.split('').map((c) => `<i class="${c}">${c}</i>`).join('')}</span>`;
      h += `<div class="card2"><h3>Recent league form</h3>
        ${p.fh ? `<div class="form-row"><span>${esc(fx.h)}</span>${chips(p.fh)}</div>` : ''}
        ${p.fa ? `<div class="form-row"><span>${esc(fx.a)}</span>${chips(p.fa)}</div>` : ''}</div>`;
    }
    if (p.h2h && p.h2h.length) {
      h += `<div class="card2"><h3>Last meetings</h3>${p.h2h.map((m) => `<div class="h2h-row"><span class="d">${esc(m.d ? fmt({ day: 'numeric', month: 'short', year: 'numeric' }, parseYmd(m.d)) : '')}</span><span class="t">${esc(m.h)} – ${esc(m.a)}</span><span class="s">${m.gh ?? '–'}–${m.ga ?? '–'}</span></div>`).join('')}</div>`;
    }
    h += `<p class="src">${p.demo ? 'Sample prediction (made up).' : 'Prediction by API-Football.'} Not a guarantee.</p>`;
    return h;
  }

  function settingsHTML() {
    const key = getKey(), st = S.status, limit = getLimit(), used = Math.min(usage(), limit);
    let statusLine = '';
    if (key && !S.demo && st) {
      statusLine = st.ok
        ? `<div class="key-status ok">Key works${st.plan ? ` · ${esc(st.plan)} plan` : ''}${st.active ? '' : ' · subscription inactive'}</div>`
        : `<div class="key-status bad">${esc(st.kind === 'net' ? st.msg : `Key problem: ${st.msg}`)}</div>`;
    } else statusLine = '<div class="key-status" id="keyStatus"></div>';
    const leagues = myLeagues();
    return `<div class="sh-top"><h2 class="sh-title">Settings</h2><button class="close-btn" data-act="close-sheet" aria-label="Close">${ICON.close}</button></div>

      <div class="set-sec"><h3>API-Football key</h3><div class="set-card">
        <div class="field"><input id="keyInput" type="password" inputmode="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Paste your key" value="${esc(key || DEFAULT_KEY)}" aria-label="API-Football key">
          <button class="eye" data-act="toggle-key" aria-label="Show or hide key">${ICON.eye}</button></div>
        <div class="btn-row"><button class="btn primary" data-act="save-key">Save</button><button class="btn" data-act="test-key">Test</button></div>
        <div id="keyStatusWrap">${statusLine}</div>
        <details class="how"${key || DEFAULT_KEY ? '' : ' open'}><summary>How to get a free key</summary><ol>
          <li>Open <a href="${SIGNUP_URL}" target="_blank" rel="noopener">dashboard.api-football.com</a> and create a free account (no card needed).</li>
          <li>Confirm your email, then sign in.</li>
          <li>Copy the key shown on the <a href="${DASHBOARD_URL}" target="_blank" rel="noopener">dashboard</a> home page and paste it above.</li>
        </ol></details>
      </div></div>

      <div class="set-sec"><h3>Today's free requests</h3><div class="set-card">
        <div class="row-line" style="padding:0;border:0"><span><b class="tnum">${used} of ${limit}</b> used</span><span class="tnum" style="color:var(--muted);font-size:13px">resets ${resetTimeText()}</span></div>
        <div class="meter"><i style="width:${Math.round((used / limit) * 100)}%"></i></div>
        <p>Each day's match list uses 1 request, each tip uses 1, and checking your key uses 1. Days and tips you've opened are saved on this device, so opening them again is free. Every device using the same key shares the same daily limit.</p>
      </div></div>

      <div class="set-sec"><h3>My leagues</h3><div class="set-card">
        ${leagues.length ? leagues.map((id) => { const i = leagueInfo(id); return `<div class="row-line"><span>${esc(i.n)}<small>${esc(countryLabel(i.c))}</small></span><button class="rm" data-remove-league="${id}" aria-label="Remove ${esc(i.n)}">${ICON.close}</button></div>`; }).join('') : '<p>No leagues yet.</p>'}
        <p style="margin-top:10px">Tips load by themselves for these leagues. To add one, open “All matches” and tap its ☆.</p>
        ${JSON.stringify(leagues) !== JSON.stringify(DEFAULT_LEAGUES) ? '<button class="btn" data-act="reset-leagues" style="margin-top:4px">Reset to the main leagues</button>' : ''}
      </div></div>

      <div class="set-sec"><h3>Sample data</h3><div class="set-card">
        <div class="row-line" style="padding:0;border:0"><span>Show sample matches<small>Made-up matches for trying the app</small></span><label class="switch"><input type="checkbox" id="demoToggle"${S.demo ? ' checked' : ''} aria-label="Show sample matches"><i></i></label></div>
      </div></div>

      <div class="set-sec"><h3>Saved on this phone</h3><div class="set-card">
        <p>Match lists and tips are saved so the app works offline. Your key and leagues are kept when you clear them.</p>
        <button class="btn danger" data-act="clear-data">Clear saved matches and tips</button>
      </div></div>

      <p class="src">Time zone: ${esc(TZ || 'UTC')} · Data from API-Football.<br>Predictions are estimates, not guarantees. 18+.</p>`;
  }
  function setKeyStatus(cls, text) {
    const w = $('#keyStatusWrap');
    if (w) w.innerHTML = `<div class="key-status ${cls}">${esc(text)}</div>`;
  }
  async function testKey() {
    if (!getKey()) { setKeyStatus('bad', 'Paste your key and tap Save first.'); return; }
    setKeyStatus('', 'Checking…');
    const st = await refreshStatus();
    if (S.sheet && S.sheet.type === 'settings') renderSheet();
    return st;
  }

  // ---------------------------------------------------------------- actions
  function selectDate(ds) {
    S.monthOpen = false;
    if (ds !== S.date) {
      S.date = ds;
      S.query = '';
      const s = $('#search'); if (s) s.value = '';
      window.scrollTo(0, 0);
      const list = $('#list');
      list.classList.remove('fade'); void list.offsetWidth; list.classList.add('fade');
    }
    renderAll();
    clearTimeout(S.dayTimer);
    S.dayTimer = setTimeout(() => loadDay(ds), 250);
  }
  function setView(v) {
    if (v === S.view) return;
    S.view = v;
    store.set('md:view', v);
    renderAll();
  }
  function toggleStar(id) {
    const list = myLeagues(), i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1);
    else {
      list.push(id);
      const day = getDay(S.date), L = day && day.L[id];
      if (L) { const info = store.get('md:leagueInfo', {}) || {}; info[id] = { n: L.n, c: L.c }; store.set('md:leagueInfo', info); }
    }
    store.set('md:leagues', list);
    renderAll();
    if (i < 0) scheduleTips(S.date);
  }
  function toggleGroup(id) {
    if (S.expanded.has(id)) S.expanded.delete(id); else S.expanded.add(id);
    renderList();
  }
  async function saveKey() {
    const input = $('#keyInput');
    const v = (input ? input.value : '').trim().replace(/\s+/g, '');
    if (!v) {
      store.del('md:key'); S.status = null; renderSheet(); renderAll(); return;
    }
    store.set('md:key', v);
    S.status = null;
    if (S.demo) { S.demo = false; store.set('md:demo', false); }
    clearBanner();
    setKeyStatus('', 'Saved. Checking your key…');
    const st = await refreshStatus();
    if (S.sheet && S.sheet.type === 'settings') renderSheet();
    renderAll();
    if (st && st.ok) loadDay(S.date, true);
  }
  function setDemo(on) {
    S.demo = !!on;
    store.set('md:demo', S.demo);
    S.pending.clear();
    S.demoReq.clear();
    dropQueued(() => true);
    clearBanner();
    if (S.sheet && S.sheet.type === 'settings') renderSheet();
    renderAll();
    window.scrollTo(0, 0);
    if (!S.demo) loadDay(S.date);
  }
  function clearData() {
    if (!window.confirm('Delete saved matches and tips from this phone? Your key and leagues stay.')) return;
    for (const k of store.keys('md:day:')) store.del(k);
    for (const k of store.keys('md:p:')) store.del(k);
    memDays.clear(); memPreds.clear(); S.held = {};
    closeSheet();
    renderAll();
    loadDay(S.date, true);
  }
  function refresh() {
    if (S.demo) { demoDays.clear(); renderAll(); return; }
    if (!getKey()) { openSheet({ type: 'settings' }); return; }
    loadDay(S.date, true);
  }

  // ---------------------------------------------------------------- events
  function onClick(e) {
    const t = e.target;
    const tip = t.closest('[data-tip]');
    if (tip) { e.stopPropagation(); requestTip(Number(tip.dataset.tip)); return; }
    const star = t.closest('[data-star]');
    if (star) { e.stopPropagation(); toggleStar(Number(star.dataset.star)); return; }
    const rm = t.closest('[data-remove-league]');
    if (rm) {
      const id = Number(rm.dataset.removeLeague);
      store.set('md:leagues', myLeagues().filter((x) => x !== id));
      renderSheet(); renderAll(); return;
    }
    const dateBtn = t.closest('[data-date]');
    if (dateBtn) { selectDate(dateBtn.dataset.date); return; }
    const shift = t.closest('[data-shift]');
    if (shift) { selectDate(addDays(S.date, Number(shift.dataset.shift))); return; }
    const mon = t.closest('[data-month]');
    if (mon) { const c = S.monthCursor; S.monthCursor = new Date(c.getFullYear(), c.getMonth() + Number(mon.dataset.month), 1); renderMonth(); return; }
    const view = t.closest('[data-view]');
    if (view) { setView(view.dataset.view); return; }
    const tog = t.closest('[data-toggle]');
    if (tog) { toggleGroup(Number(tog.dataset.toggle)); return; }
    const act = t.closest('[data-act]');
    if (act) {
      const a = act.dataset.act;
      if (a === 'close-sheet') closeSheet();
      else if (a === 'settings') openSheet({ type: 'settings' });
      else if (a === 'dismiss-banner') clearBanner();
      else if (a === 'demo-on') setDemo(true);
      else if (a === 'show-all') setView('all');
      else if (a === 'refresh') refresh();
      else if (a === 'past-tips') { if (S.demo) getAllTips(true); else scheduleTips(S.date, true); }
      else if (a === 'all-tips') getAllTips();
      else if (a === 'stop-tips') stopTips();
      else if (a === 'save-key') saveKey();
      else if (a === 'test-key') testKey();
      else if (a === 'clear-data') clearData();
      else if (a === 'reset-leagues') { store.del('md:leagues'); renderSheet(); renderAll(); scheduleTips(S.date); }
      else if (a === 'toggle-key') { const i = $('#keyInput'); if (i) i.type = i.type === 'password' ? 'text' : 'password'; }
      return;
    }
    const row = t.closest('.match[data-id]');
    if (row) {
      const id = Number(row.dataset.id), fx = findFx(id);
      openSheet({ type: 'match', id });
      // Opening a match without its tip loads the tip straight away (1 request).
      if (fx && !getPred(fx) && !S.pending.has(id) && !OFF.has(fx.st) && (S.demo || (getKey() && remaining() > 0))) requestTip(id);
      return;
    }
    if (t.closest('#monthBtn')) {
      S.monthOpen = !S.monthOpen;
      if (S.monthOpen) { const d = parseYmd(S.date); S.monthCursor = new Date(d.getFullYear(), d.getMonth(), 1); }
      renderHeader(); return;
    }
    if (t.closest('#todayBtn')) { selectDate(S.today); return; }
    if (t.closest('#refreshBtn')) { refresh(); return; }
    if (t.closest('#settingsBtn')) { openSheet({ type: 'settings' }); }
  }
  function bind() {
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { if (S.sheet) closeSheet(); else if (S.monthOpen) { S.monthOpen = false; renderHeader(); } return; }
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[role="button"]')) { e.preventDefault(); e.target.click(); }
    });
    document.addEventListener('change', (e) => { if (e.target && e.target.id === 'demoToggle') setDemo(e.target.checked); });
    // broken logo -> initials badge
    document.addEventListener('error', (e) => {
      const img = e.target;
      if (!img || img.tagName !== 'IMG') return;
      if (img.classList.contains('logo')) {
        const name = img.dataset.name || '';
        const span = document.createElement('span');
        span.className = 'logo ini'; span.style.setProperty('--h', String(hashStr(name) % 360)); span.textContent = initials(name);
        img.replaceWith(span);
      } else if (img.classList.contains('lg-logo')) {
        const span = document.createElement('span'); span.className = 'lg-logo ph'; span.innerHTML = ICON.trophy; img.replaceWith(span);
      }
    }, true);
    const search = $('#search');
    let st = 0;
    search.addEventListener('input', () => { clearTimeout(st); st = setTimeout(() => { S.query = search.value; renderList(); }, 120); });
    // swipe the week strip to change week
    const week = $('#week');
    let sx = 0, sy = 0;
    week.addEventListener('touchstart', (e) => { const p = e.touches[0]; sx = p.clientX; sy = p.clientY; }, { passive: true });
    week.addEventListener('touchend', (e) => {
      const p = e.changedTouches[0], dx = p.clientX - sx, dy = p.clientY - sy;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) selectDate(addDays(S.date, dx < 0 ? 7 : -7));
    }, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      const t = todayYmd();
      if (t !== S.today) S.today = t;
      renderAll();
      loadDay(S.date);
    });
    window.addEventListener('online', () => { clearBanner('net'); loadDay(S.date); });
    window.addEventListener('offline', () => setBanner('info', "You're offline. Showing saved data.", null, 'net'));
  }

  function init() {
    prune();
    bind();
    renderAll();
    loadDay(S.date);
    // The account check costs 1 request, so only sync the usage counter every few hours
    // (it also picks up requests made from another device with the same key).
    if (getKey() && !S.demo && Date.now() - (Number(store.get('md:statusAt', 0)) || 0) > 3 * 3600e3) refreshStatus();
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('./sw.js').catch(() => { /* offline support is optional */ });
    }
  }
  // exposed for testing in the browser console only
  window.__matchday = { slimFixture, slimPrediction, errorInfo, pickOf, parseOU, judgePick, judgeOU, statusInfo };
  init();
})();
