// Copied verbatim from shapeshifter-sales/web/src/utils/splits.js (9 Oct 2026), apart from
// import paths. Keep in sync: the planner must agree with the Sales App's Stock page.

// Packaging Splits sheet (Carla's) -> upcoming pack runs per SKU.
//
// One tab per month, named "October 2026" etc. (some typos, e.g. "Februrary").
// Inside a tab: a header row with 16PK / 24PK / 20L / 30L / 50L columns, then
// a date row (date in column B), then one row per beer packed that day, until
// the "TOTAL:" row. Column positions drift between months, so read the header.

import { getExternalTabs, getCalendarEvents } from './sheets';

export const SPLITS_SHEET_ID = '1Ukft3qvZqP-KFkwgPWD7OCVB2LQF_b42k7Bdc5N4nyk';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const FORMAT_HEADERS = ['16PK', '24PK', '20L', '30L', '50L'];

export function normalise(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// "Golden Ratio - West Coast IPA 6.3% 24x375mL" -> "golden ratio"
// "Party Shirt Hazy Pale 5% 50L"               -> "party shirt hazy pale"
export function brandOf(xeroName) {
  const head = String(xeroName || '').split(' - ')[0];
  const words = head.split(/\s+/);
  const cut = words.findIndex((w) => /\d/.test(w) && !/^\d$/.test(w));
  return normalise((cut > 0 ? words.slice(0, cut) : words).join(' '));
}

// "Party Shirt KEGS" -> "party shirt", "Fifth Element - Oat Cream DIPA" -> "fifth element"
function splitsBeerKey(name) {
  const head = String(name).split(' - ')[0].split('(')[0];
  return normalise(head).replace(/\b(kegs?|cartons?|cans?|split)\b/g, '').replace(/\s+/g, ' ').trim();
}

// Which splits column a SKU is packed into
export function splitsFormatFor(col) {
  const t = `${col.code} ${col.name}`.toLowerCase();
  if (/50\s*l/.test(t) || (t.includes('keg') && !/30\s*l|20\s*l/.test(t))) return '50L';
  if (/30\s*l/.test(t)) return '30L';
  if (/20\s*l/.test(t)) return '20L';
  if (/440|16\s*x|16pk|16 pk/.test(t)) return '16PK';
  return '24PK';
}

function serialToDate(n) {
  // Sheets serial: days since 30 Dec 1899
  const d = new Date(1899, 11, 30);
  d.setDate(d.getDate() + Math.floor(n));
  return d;
}

function tabMonth(title) {
  const m = /^([A-Za-z]+)\s+(\d{4})$/.exec(title.trim());
  if (!m) return null;
  const idx = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
  return idx < 0 ? null : { year: Number(m[2]), month: idx };
}

function parseTab(rows) {
  const packs = [];
  let cols = null;
  let date = null;
  for (const row of rows) {
    const cells = row.map((c) => (typeof c === 'string' ? c.trim() : c));
    if (!cols) {
      if (cells.some((c) => FORMAT_HEADERS.includes(String(c).toUpperCase()))) {
        cols = {};
        cells.forEach((c, i) => {
          const h = String(c).toUpperCase();
          if (FORMAT_HEADERS.includes(h)) cols[h] = i;
        });
      }
      continue;
    }
    const label = cells[1];
    if (typeof label === 'string' && /^total/i.test(label)) break;
    if (typeof label === 'number' && label > 40000) { date = serialToDate(label); continue; }
    if (!date || typeof label !== 'string' || !label) continue;
    const qty = {};
    for (const [h, i] of Object.entries(cols)) {
      const v = Number(cells[i]);
      if (v > 0) qty[h] = v;
    }
    if (Object.keys(qty).length) packs.push({ date, beer: label, key: splitsBeerKey(label), qty });
  }
  return packs;
}

// How far ahead to read the Splits sheet and the calendar
export const LOOKAHEAD_MONTHS = 6;

/** Pack runs from today onwards, across the current month and the next six. */
/** Packs from the start of last month onward (recent ones feed "packed, not counted"). */
export async function getPacks(today = new Date()) {
  const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const end = new Date(today.getFullYear(), today.getMonth() + LOOKAHEAD_MONTHS + 1, 1);
  const tabs = await getExternalTabs(SPLITS_SHEET_ID, (titles) => titles.filter((t) => {
    const tm = tabMonth(t);
    if (!tm) return false;
    const d = new Date(tm.year, tm.month, 1);
    return d >= start && d < end;
  }));
  return Object.values(tabs)
    .flatMap(parseTab)
    .sort((a, b) => a.date - b.date);
}

export async function getUpcomingPacks(today = new Date()) {
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return (await getPacks(today)).filter((p) => p.date >= todayStart);
}

// Drop a trailing "s" per word so "Findon Finest" and "Findons Finest" agree
function loose(s) {
  return s.split(' ').map((w) => (w.length > 3 ? w.replace(/s$/, '') : w)).join(' ');
}

export function brandMatches(brand, key) {
  if (!key) return false;
  const b = loose(brand);
  const k = loose(key);
  return b === k || b.startsWith(`${k} `) || k.startsWith(`${b} `);
}

/** Upcoming packs that land in this SKU, as [{ date, qty, beer }]. */
export function packsForSku(col, packs) {
  const brand = brandOf(col.name);
  if (!brand) return [];
  const fmt = splitsFormatFor(col);
  return packs
    .filter((p) => p.qty[fmt] && brandMatches(brand, p.key))
    .map((p) => ({ date: p.date, qty: p.qty[fmt], beer: p.beer }));
}

// ── Brewery Schedule calendar (Carla's) ────────────────────────────────────
// Titles: "BREW FV8 - Party Shirt CARTONS", "BREW - Findon's KEGS",
// "BREW - FV7 Findons KEGS (for ACM)", "PACK BBT - Nordic SPLIT".
// KEGS / CARTONS limit the run to one format; SPLIT or nothing means both.

export const BREWERY_CALENDAR_ID = 'c_b1cff5f4cc9e1080f3f97ff0b1d0545af9f11615c6be42d0460dfc1a84e51e5b@group.calendar.google.com';

function eventDate(e) {
  if (e.start?.date) {
    const [y, m, d] = e.start.date.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const t = new Date(e.start?.dateTime);
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

function parseScheduleTitle(title) {
  const m = /^\s*(BREW|PACK)\b(.*)$/i.exec(title || '');
  if (!m) return null;
  const rest = m[2].includes(' - ') ? m[2].slice(m[2].indexOf(' - ') + 3) : m[2].replace(/^[^-]*-/, '');
  const beer = rest.replace(/^\s*(FV\d+|BBT[A-B]?)\b/i, '').split('(')[0].trim();
  const t = beer.toLowerCase();
  const formats = /\bkegs?\b/.test(t) && !/\bsplit\b/.test(t) ? 'kegs'
    : /\bcartons?\b|\bcans?\b|375ml|440ml/.test(t) ? 'cans' : 'both';
  return { kind: m[1].toUpperCase(), beer, key: splitsBeerKey(beer.replace(/\b\d+m?l\b/gi, '')), formats };
}

/** BREW and PACK events from 10 weeks ago to the end of the lookahead. */
export async function getBrewSchedule(token, today = new Date()) {
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 70);
  const to = new Date(today.getFullYear(), today.getMonth() + LOOKAHEAD_MONTHS + 1, 1);
  const events = await getCalendarEvents(BREWERY_CALENDAR_ID, from, to, token);
  return events
    .map((e) => {
      const p = parseScheduleTitle(e.summary);
      return p && p.key ? { ...p, date: eventDate(e), title: e.summary } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.date - b.date);
}

/** Schedule events (BREW or PACK) that apply to this SKU. */
export function scheduleForSku(col, schedule, kind) {
  const brand = brandOf(col.name);
  if (!brand) return [];
  const keg = ['50L', '30L', '20L'].includes(splitsFormatFor(col));
  return schedule.filter((e) => e.kind === kind
    && brandMatches(brand, e.key)
    && (e.formats === 'both' || (e.formats === 'kegs') === keg));
}
