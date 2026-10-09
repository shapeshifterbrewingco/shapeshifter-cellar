// Copied verbatim from shapeshifter-sales/web/src/utils/months.js (9 Oct 2026), apart from
// import paths. Keep in sync: the planner must agree with the Sales App's Stock page.

// Month keys are "YYYY-MM" and must be derived from LOCAL time.
//
// Adelaide is UTC+9:30/+10:30, so `new Date(y, m, 1).toISOString().slice(0, 7)`
// returns the PREVIOUS month: local midnight on the 1st is still 14:30 on the
// last day of the prior month in UTC. That is how budgets saved for September
// ended up filed against August.

export function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// Month key `n` months after `from` (n may be negative).
export function monthKeyOffset(n, from = new Date()) {
  return monthKey(new Date(from.getFullYear(), from.getMonth() + n, 1));
}

// Human label for a "YYYY-MM" key, e.g. "September 2026".
export function monthLabel(key, opts = { month: 'long', year: 'numeric' }) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-AU', opts);
}

// Day keys are "YYYY-MM-DD", also from LOCAL time. Never use
// toISOString().slice(0, 10): before 9:30/10:30am in Adelaide it is yesterday.
export function dayKey(date = new Date()) {
  return `${monthKey(date)}-${String(date.getDate()).padStart(2, '0')}`;
}

// Day key `n` days after a "YYYY-MM-DD" key (n may be negative).
export function dayKeyOffset(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}

// Local day key of a stored ISO timestamp, or '' if it doesn't parse.
export function timestampDayKey(ts) {
  const d = ts ? new Date(ts) : null;
  return d && !Number.isNaN(d.getTime()) ? dayKey(d) : '';
}

// Local month key of a stored ISO timestamp, or ''.
export function timestampMonthKey(ts) {
  return timestampDayKey(ts).slice(0, 7);
}
