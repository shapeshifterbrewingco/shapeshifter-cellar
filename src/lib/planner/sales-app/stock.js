// Copied verbatim from shapeshifter-sales/web/src/utils/stock.js (9 Oct 2026), apart from
// import paths. Keep in sync: the planner must agree with the Sales App's Stock page.

// Stock on hand, run-out and incoming stock, shared by the Stock page and the
// Visits page. Pure calculations plus one loader; no React.
//
// On hand comes from the stock ledger below, shared with the Orders page and
// the visit form: opening stock + manual adjustments - this month's order lines. Draw rate is every order line
// (wholesale AND taproom/festival stock transfers) over the last N weeks.
// Pre-orders already filed against next month are taken off before projecting.
//
// Limited releases are flagged per brand. Default: a brand only sold in 16x440
// cans is limited. Retired brands are hidden. Seasonal brands hide outside their
// season (if none on hand) and return SEASON_LEAD_MONTHS before it starts, or
// BREW_RECALL_DAYS before their next brew. Overrides live in the settings tab.

import { getOrderLines, getStockEntries, getStockAdjustments, getSkuColumns, getSettingJson, getExpectedOrders } from './sheets';
import { PRODUCTS } from './products';
import { monthKey, monthKeyOffset, timestampDayKey } from './months';
import { getPacks, packsForSku, brandOf, splitsFormatFor, scheduleForSku, brandMatches } from './splits';

export const MAX_WINDOW_WEEKS = 8;
export const BREW_RECALL_DAYS = 56;

export const LIMITED_KEY = 'stock_limited_brands';
export const RETIRED_KEY = 'stock_retired_brands';
// Retired before the flag existed (Oct 2026). "party shirt" is the 4.2% Session
// Hazy only - the current beer's brand is "party shirt hazy pale".
export const DEFAULT_RETIRED = new Set(['party shirt', 'sunshowers', 'headspace']);

export const SEASONAL_KEY = 'stock_seasonal_brands';
// Southern hemisphere. Months are 0-indexed starts; each season runs 3 months.
export const SEASONS = {
  summer: { label: 'Summer', start: 11 },
  autumn: { label: 'Autumn', start: 2 },
  winter: { label: 'Winter', start: 5 },
  spring: { label: 'Spring', start: 8 },
};
const SEASON_LEAD_MONTHS = 2; // back on the list in time to brew and take preorders
export const DEFAULT_SEASONAL = { 'make your move': 'winter', 'hoodie weather': 'winter' };

// 'in' (in season), 'soon' (lead-in before it starts) or 'off'
export function seasonPhase(season, today) {
  const m = today.getMonth();
  const offset = (m - SEASONS[season].start + 12) % 12; // months since season start
  if (offset < 3) return 'in';
  if (offset >= 12 - SEASON_LEAD_MONTHS) return 'soon';
  return 'off';
}

const FORMAT_BY_CODE = new Map(
  PRODUCTS.filter((p) => p.xero_item_code).map((p) => [p.xero_item_code.toLowerCase(), p])
);

export function isKeg(col) {
  const p = FORMAT_BY_CODE.get(col.code?.toLowerCase());
  if (p) return p.format === 'Keg';
  const t = `${col.name} ${col.code}`.toLowerCase();
  return t.includes('keg') || t.includes('50l') || t.includes('30l');
}

// Local-date YYYY-MM-DD (toISOString shifts a day in Adelaide)
export function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

// "Golden Ratio - West Coast IPA 6.3% 24x375mL" -> "Golden Ratio"
export function displayName(xeroName) {
  const head = String(xeroName || '').split(' - ')[0];
  const words = head.split(/\s+/);
  const cut = words.findIndex((w) => /\d/.test(w) && !/^\d$/.test(w));
  return (cut > 0 ? words.slice(0, cut) : words).join(' ');
}

export const FORMAT_LABEL = { '24PK': 'Cans 24pk', '16PK': 'Cans 16pk', '50L': 'Keg 50L', '30L': 'Keg 30L', '20L': 'Keg 20L' };

// Bands, most urgent first
export const BANDS = [
  { key: 'out',  label: 'Out',        test: (w, soh) => soh <= 0 },
  { key: 'red',  label: '< 1 week',   test: (w) => w < 1 },
  { key: 'amber', label: '1-2 weeks', test: (w) => w < 2 },
  { key: 'yellow', label: '2-4 weeks', test: (w) => w < 4 },
  { key: 'green', label: '4+ weeks',  test: () => true },
];

export function bandFor(weeks, soh) {
  if (soh == null) return 'unknown';
  if (soh <= 0) return 'out';
  if (weeks == null) return 'idle';
  return BANDS.find((b) => b.test(weeks, soh)).key;
}

// 'dormant' = none on hand and nothing selling: not urgent, sinks to the bottom
export const BAND_ORDER = { out: 0, red: 1, amber: 2, yellow: 3, green: 4, idle: 5, dormant: 6, unknown: 7 };

// ── Stock ledger ────────────────────────────────────────────────────────────
// Rows on the stock tab are counts: stock on hand at the start of that month.
// A month with no count carries on from the latest earlier one: count +
// adjustments - order lines, month by month. So an order added late to last
// month, or deleted from it, flows into this month's opening stock (a
// one-off monthly snapshot froze it). `lines` must reach back to the oldest
// count used, so callers pass every order line.

function sumByMonthSku(rows, monthOf, qtyOf) {
  const m = new Map(); // "month::sku" -> qty
  for (const r of rows) {
    const k = `${monthOf(r)}::${r.sku}`;
    m.set(k, (m.get(k) || 0) + (qtyOf(r) || 0));
  }
  return m;
}

/** Opening stock per SKU for `month` (Map sku -> qty). SKUs never counted are absent. */
export function openingStock({ entries, adjustments, lines, month }) {
  // Latest count per SKU at or before `month`; the last row wins on duplicates
  const counts = new Map(); // sku -> { month, qty }
  for (const e of entries) {
    if (!e.sku || !e.month || e.month > month) continue;
    const cur = counts.get(e.sku);
    if (!cur || e.month >= cur.month) counts.set(e.sku, { month: e.month, qty: e.quantity });
  }
  const adj = sumByMonthSku(adjustments, (a) => a.month, (a) => a.qty_delta);
  const used = sumByMonthSku(lines, (l) => (l.order_date || '').slice(0, 7), (l) => l.qty);

  const out = new Map();
  for (const [sku, c] of counts) {
    let qty = c.qty;
    for (let m = c.month; m < month; m = monthKeyOffset(1, new Date(`${m}-01T00:00:00`))) {
      qty += (adj.get(`${m}::${sku}`) || 0) - (used.get(`${m}::${sku}`) || 0);
    }
    out.set(sku, qty);
  }
  return out;
}

/** Whether `month` has an actual count row for the SKU (vs carried forward). */
export function hasCount(entries, sku, month) {
  return entries.some((e) => e.sku === sku && e.month === month);
}

/** On hand now per SKU for `month`: opening + that month's adjustments - its order lines. */
export function onHandStock({ entries, adjustments, lines, month }) {
  const open = openingStock({ entries, adjustments, lines, month });
  const out = new Map();
  for (const [sku, qty] of open) out.set(sku, qty);
  for (const a of adjustments) if (a.month === month && out.has(a.sku)) out.set(a.sku, out.get(a.sku) + (a.qty_delta || 0));
  for (const l of lines) if ((l.order_date || '').startsWith(month) && out.has(l.sku)) out.set(l.sku, out.get(l.sku) - (l.qty || 0));
  return out;
}

// ── Big and expected orders ─────────────────────────────────────────────────
// An expected order is held against stock until a real order from that
// customer for that SKU is logged after it was entered; it then drops off and
// the real order's lines are treated as one-offs. Unplanned one-offs are lines
// several times the SKU's usual line size and worth 2+ weeks of the rest of
// its sales. One-offs still come off stock but are left out of the weekly
// rate, or one big sale makes a beer look like it sells far faster than it
// does for the next 8 weeks.

const RESERVE_GRACE_DAYS = 30; // keep holding a late expected order this long
// Below this an order is never "big" (no popup, never left out of the rate).
// James, Oct 2026: under 5 cartons isn't big. Kegs keep the ratio rules only.
export const MIN_BIG_CARTONS = 5;

/** Expected orders split into still-open (reserved) and fulfilled, plus the lines that fulfilled them. */
export function matchExpectedOrders(expected = [], lines = [], today = new Date()) {
  const graceKey = dateKey(addDays(today, -RESERVE_GRACE_DAYS));
  const reserved = [];
  const plannedLineIds = new Set();
  for (const e of expected) {
    if (e.status !== 'open') continue;
    const from = timestampDayKey(e.created_at) || '0000';
    const hits = lines.filter((l) => l.customer_id === e.customer_id && l.sku === e.sku && (l.order_date || '') >= from);
    if (hits.length) hits.forEach((l) => plannedLineIds.add(l.order_id));
    else if ((e.expected_date || '') >= graceKey) reserved.push(e);
  }
  return { reserved, plannedLineIds };
}

function splitOneOffs(list, weeks, plannedLineIds, keg) {
  const total = list.reduce((n, l) => n + (l.qty || 0), 0);
  const qtys = list.map((l) => l.qty || 0).sort((a, b) => a - b);
  const median = qtys.length ? qtys[Math.floor((qtys.length - 1) / 2)] : 0;
  const oneOffs = list.filter((l) => {
    if (plannedLineIds.has(l.order_id)) return true;
    if (list.length < 4 || (!keg && (l.qty || 0) < MIN_BIG_CARTONS)) return false;
    const restPerWeek = (total - l.qty) / weeks;
    return l.qty >= 3 * median && restPerWeek > 0 && l.qty >= 2 * restPerWeek;
  });
  return { oneOffs, normal: total - oneOffs.reduce((n, l) => n + (l.qty || 0), 0) };
}

/**
 * One row per SKU. `packs` from the Packaging Splits sheet, `schedule` from the
 * Brewery Schedule calendar (both may be empty).
 */
export function computeStockRows({ columns, entries, adjustments, lines, packs = [], recentPacks = [], expected = [], schedule = [], windowWeeks = 8, today = new Date() }) {
  const thisMonth = monthKey(today);
  const todayKey = dateKey(today);
  const windowStart = dateKey(addDays(today, -7 * windowWeeks));

  const opening = openingStock({ entries, adjustments, lines, month: thisMonth });

  // First order per SKU: a new release is measured over the weeks it has been
  // on sale, not the whole window, or its run-out looks up to 4x too late
  const firstSold = new Map();
  for (const l of lines) {
    const d = l.order_date || '';
    if (d && d <= todayKey && (!firstSold.has(l.sku) || d < firstSold.get(l.sku))) firstSold.set(l.sku, d);
  }

  // Positive stock adjustments by SKU, with when they were logged
  const additions = new Map();
  for (const a of adjustments) {
    if ((a.qty_delta || 0) > 0 && a.timestamp) {
      (additions.get(a.sku) || additions.set(a.sku, []).get(a.sku)).push(new Date(a.timestamp));
    }
  }

  const adj = new Map();
  for (const a of adjustments) {
    if (a.month !== thisMonth) continue;
    adj.set(a.sku, (adj.get(a.sku) || 0) + (a.qty_delta || 0));
  }

  const orderedThisMonth = new Map();
  const preordered = new Map();
  const drawn = new Map();
  const windowLines = new Map(); // sku -> lines in the rate window
  for (const l of lines) {
    const qty = l.qty || 0;
    const d = l.order_date || '';
    if (d.startsWith(thisMonth)) orderedThisMonth.set(l.sku, (orderedThisMonth.get(l.sku) || 0) + qty);
    else if (d > todayKey) preordered.set(l.sku, (preordered.get(l.sku) || 0) + qty);
    if (d >= windowStart && d <= todayKey) {
      drawn.set(l.sku, (drawn.get(l.sku) || 0) + qty);
      (windowLines.get(l.sku) || windowLines.set(l.sku, []).get(l.sku)).push(l);
    }
  }

  const { reserved: reservedOrders, plannedLineIds } = matchExpectedOrders(expected, lines, today);

  // When two SKUs of one format both match a beer name (e.g. "Party Shirt"
  // matches the dead Session Hazy and the current Hazy Pale), production goes
  // to the one that is actually moving.
  // On a tie (both idle) the more specific name wins, so one pack is never
  // credited to two SKUs.
  const activity = (col) => (drawn.get(col.code) || 0) * 1000 + Math.max(opening.get(col.code) || 0, 0);
  const losesTo = (col) => {
    const brand = brandOf(col.name);
    const fmt = splitsFormatFor(col);
    return columns.some((o) => {
      if (o.code === col.code || splitsFormatFor(o) !== fmt) return false;
      const ob = brandOf(o.name);
      if (ob === brand || !brandMatches(ob, brand)) return false;
      const a = activity(o), b = activity(col);
      return a > b || (a === b && (ob.length > brand.length || (ob.length === brand.length && o.code < col.code)));
    });
  };

  return columns.map((col) => {
    const open = opening.has(col.code) ? opening.get(col.code) : null;
    const shadowed = losesTo(col);
    const soh = open == null ? null
      : open + (adj.get(col.code) || 0) - (orderedThisMonth.get(col.code) || 0);
    const pre = preordered.get(col.code) || 0;
    const reserved = reservedOrders.filter((e) => e.sku === col.code);
    const reservedQty = reserved.reduce((n, e) => n + (e.qty || 0), 0);
    // Packed in the last fortnight with no stock added since: counted toward
    // run-out (so it isn't flagged "out, plan a brew") but shown separately
    const unconfirmed = (shadowed || soh == null ? [] : packsForSku(col, recentPacks))
      .filter((p) => !(additions.get(col.code) || []).some((t) => t >= p.date));
    const unconfirmedQty = unconfirmed.reduce((n, p) => n + (p.qty || 0), 0);
    const available = soh == null ? null : soh - pre - reservedQty + unconfirmedQty;
    const first = firstSold.get(col.code);
    const weeksOnSale = first ? (today - new Date(`${first}T00:00:00`)) / (7 * 86400000) : windowWeeks;
    const rateWeeks = Math.min(windowWeeks, Math.max(weeksOnSale, 1));
    const { oneOffs, normal } = splitOneOffs(windowLines.get(col.code) || [], rateWeeks, plannedLineIds, isKeg(col));
    const perWeek = normal / rateWeeks;
    const weeks = available == null || perWeek <= 0 ? null : Math.max(available, 0) / perWeek;
    const runOut = weeks == null ? null : addDays(today, Math.floor(weeks * 7));
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const fromSplits = shadowed ? [] : packsForSku(col, packs);
    // Calendar packs the Splits sheet doesn't have yet (within 3 days = same run)
    const fromCalendar = (shadowed ? [] : scheduleForSku(col, schedule, 'PACK'))
      .filter((e) => e.date >= todayStart)
      .filter((e) => !fromSplits.some((p) => Math.abs(p.date - e.date) <= 3 * 86400000))
      .map((e) => ({ date: e.date, qty: null, beer: e.beer }));
    const incoming = [...fromSplits, ...fromCalendar].sort((a, b) => a.date - b.date);
    const next = incoming[0] || null;
    // The brew feeding the next pack, or failing that the next brew planned
    const brews = shadowed ? [] : scheduleForSku(col, schedule, 'BREW');
    // (a brew more than 8 weeks before the pack belongs to an earlier batch)
    const brew = next
      ? [...brews].reverse().find((b) => b.date <= next.date && next.date - b.date <= 56 * 86400000) || null
      : brews.find((b) => b.date >= todayStart) || null;
    // Days with nothing on the shelf before the next pack lands
    const gapDays = next && runOut && next.date > runOut
      ? Math.round((next.date - runOut) / 86400000) : 0;
    // Negative on hand = orders taken against stock not yet packed
    const owed = soh != null && soh < 0 ? -soh : 0;
    let band = bandFor(weeks, available);
    if (band === 'out' && perWeek <= 0 && !owed) band = 'dormant';
    return {
      code: col.code,
      name: col.name,
      short: displayName(col.name),
      format: FORMAT_LABEL[splitsFormatFor(col)] || (isKeg(col) ? 'Keg' : 'Cans'),
      brand: brandOf(col.name),
      keg: isKeg(col),
      soh, pre, owed, available, perWeek, weeks, runOut, incoming, next, gapDays, brew,
      unconfirmed, unconfirmedQty, reserved, reservedQty, oneOffs,
      band,
    };
  });
}

/** Limited / retired / seasonal rules for a set of SKU columns and saved overrides. */
export function makeFlags({ columns, limitedOverrides = {}, retiredOverrides = {}, seasonalOverrides = {}, today = new Date() }) {
  // Name variants of one beer count together ("Cosmic Crusher" cans and
  // "Cosmic Crusher DDH Hazy IPA" kegs).
  const formats = new Map();
  for (const col of columns) {
    const b = brandOf(col.name);
    if (!formats.has(b)) formats.set(b, new Set());
    formats.get(b).add(splitsFormatFor(col));
  }
  const defaultLimited = new Set();
  for (const b of formats.keys()) {
    const all = new Set();
    for (const [o, f] of formats) if (brandMatches(b, o)) f.forEach((x) => all.add(x));
    if (all.has('16PK') && !all.has('24PK')) defaultLimited.add(b);
  }

  const isLimited = (brand) => (brand in limitedOverrides ? limitedOverrides[brand] : defaultLimited.has(brand));
  const isRetired = (brand) => (brand in retiredOverrides ? retiredOverrides[brand] : DEFAULT_RETIRED.has(brand));
  const seasonOf = (brand) => {
    if (brand in seasonalOverrides) return seasonalOverrides[brand] || null;
    const hit = Object.keys(DEFAULT_SEASONAL).find((k) => brandMatches(brand, k));
    return hit ? DEFAULT_SEASONAL[hit] : null;
  };
  const brewSoon = (r) => {
    if (!r.brew || r.brew.date < today) return false;
    return (r.brew.date - today) / 86400000 <= BREW_RECALL_DAYS;
  };
  // Running out of a seasonal out of season is expected, not a problem
  const offSeason = (r) => {
    const season = seasonOf(r.brand);
    return !!season && seasonPhase(season, today) === 'off';
  };
  // Off-season beers stay visible while there is stock to sell or a brew coming up
  const seasonHidden = (r) => offSeason(r) && !(r.soh > 0) && !brewSoon(r);

  return { isLimited, isRetired, seasonOf, brewSoon, offSeason, seasonHidden };
}

/** Everything computeStockRows needs except the calendar (which needs its own token). */
export async function loadStockInputs(today = new Date()) {
  const [cols, entries, adjustments, lines] = await Promise.all([
    getSkuColumns(),
    getStockEntries(),
    getStockAdjustments(),
    getOrderLines(), // every line: the ledger walks forward from the last count
  ]);
  let skuCols = cols;
  if (!skuCols?.length) {
    try { skuCols = JSON.parse(localStorage.getItem('ss_order_columns') || '[]'); } catch { skuCols = []; }
  }
  // The settings list can hold the same SKU twice
  const seen = new Set();
  const columns = (skuCols || []).filter((c) => !seen.has(c.code) && seen.add(c.code));

  // Secondary sources: the pages still work without them
  const [limitedOverrides, retiredOverrides, seasonalOverrides, packs, expected] = await Promise.all([
    getSettingJson(LIMITED_KEY).catch(() => null),
    getSettingJson(RETIRED_KEY).catch(() => null),
    getSettingJson(SEASONAL_KEY).catch(() => null),
    getPacks(today).catch(() => null),
    getExpectedOrders().catch(() => []),
  ]);
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const fortnightAgo = addDays(todayStart, -14);
  return {
    columns, entries, adjustments, lines,
    limitedOverrides: limitedOverrides || {},
    retiredOverrides: retiredOverrides || {},
    seasonalOverrides: seasonalOverrides || {},
    packs: packs && packs.filter((p) => p.date >= todayStart), // null when the Splits sheet could not be read
    recentPacks: (packs || []).filter((p) => p.date >= fortnightAgo && p.date < todayStart),
    expected,
  };
}

/**
 * What taking `qty` more of a SKU does to supply. Returns null if it doesn't
 * open (or noticeably lengthen) a gap before the next pack, else
 * { after, next, gapDays } where gapDays is null when no pack is planned.
 */
export function orderImpact(row, qty, today = new Date()) {
  if (!row || row.available == null || !qty) return null;
  if (!row.keg && qty < MIN_BIG_CARTONS) return null;
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dryDays = (left) => {
    if (!row.next) return left <= 0 ? Infinity : null;
    const emptyOn = left <= 0 || row.perWeek <= 0
      ? (left <= 0 ? todayStart : null)
      : addDays(todayStart, Math.floor((left / row.perWeek) * 7));
    if (!emptyOn) return 0;
    return Math.max(Math.round((row.next.date - emptyOn) / 86400000), 0);
  };
  const after = row.available - qty;
  const before = dryDays(row.available) || 0;
  const gap = dryDays(after);
  if (gap == null || gap === 0) return null;
  if (gap !== Infinity && gap <= before + 3) return null; // already short; this order isn't the cause
  if (gap === Infinity && row.available <= 0) return null;
  return { after, next: row.next, gapDays: gap === Infinity ? null : gap };
}
