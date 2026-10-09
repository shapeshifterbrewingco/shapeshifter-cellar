// Server-side stand-in for shapeshifter-sales/web/src/api/sheets.js: the same
// read functions and row parsing, through the planner's service account. Read
// only - the planner never writes to the Sales App sheet.

import { SALES_SHEET_ID, sheetValues, sheetTabs, sheetBatch, listEvents } from '../google'

const DELETED = 'DELETED'
const liveId = (v) => (v && v !== DELETED ? v : '')

const read = (range) => sheetValues(SALES_SHEET_ID, range).catch(() => [])

function rowToOrderLine(row) {
  return {
    order_id:      liveId(row[0]),
    visit_id:      row[1]  || '',
    customer_id:   row[2]  || '',
    customer_name: row[3]  || '',
    rep_name:      row[4]  || '',
    order_date:    row[5]  || '',
    sku:           row[6]  || '',
    product_name:  row[7]  || '',
    format:        row[8]  || '',
    size:          row[9]  || '',
    qty:           row[10] ? parseInt(row[10], 10) : 0,
    // Prices deliberately dropped: the planner has no need for dollar figures
  }
}

export async function getOrderLines() {
  return (await read('orders!A2:M')).map(rowToOrderLine).filter((o) => o.order_id)
}

export async function getStockEntries() {
  return (await read('stock!A2:C'))
    .filter((r) => r[0] && r[0] !== DELETED)
    .map((r) => ({ sku: r[0], month: r[1] || '', quantity: r[2] ? parseInt(r[2], 10) : 0 }))
}

export async function getStockAdjustments() {
  return (await read('stock_adjustments!A2:E'))
    .filter((r) => r[0] && r[0] !== DELETED)
    .map((r) => ({
      sku: r[0],
      month: r[1] || '',
      qty_delta: r[2] ? parseInt(r[2], 10) : 0,
      timestamp: r[3] || '',
      note: r[4] || '',
    }))
}

// One forecast reads four settings at once; share the read for a few seconds
let settingsRead = null
function settings() {
  if (!settingsRead || Date.now() - settingsRead.at > 5000) settingsRead = { at: Date.now(), rows: read('settings!A2:B') }
  return settingsRead.rows
}

export async function getSettingJson(key) {
  const row = (await settings()).find((r) => r[0] === key)
  if (!row || !row[1]) return null
  try { return JSON.parse(row[1]) } catch { return null }
}

export async function getSkuColumns() {
  return getSettingJson('sku_columns')
}

export async function getExpectedOrders() {
  return (await read('expected_orders!A2:K'))
    .filter((r) => liveId(r[0]))
    .map((r) => ({
      id:            r[0],
      customer_id:   r[1] || '',
      customer_name: r[2] || '',
      sku:           r[3] || '',
      product_name:  r[4] || '',
      qty:           parseInt(r[5], 10) || 0,
      expected_date: r[6] || '',
      note:          r[7] || '',
      created_by:    r[8] || '',
      created_at:    r[9] || '',
      status:        r[10] || 'open',
    }))
}

export async function getExternalTabs(spreadsheetId, pickTabs) {
  const titles = pickTabs(await sheetTabs(spreadsheetId))
  if (!titles.length) return {}
  const values = await sheetBatch(spreadsheetId, titles.map((t) => `'${t}'!A1:Z60`))
  const out = {}
  titles.forEach((t, i) => { out[t] = values[i] })
  return out
}

/** Brewery Schedule only; token ignored (service account). Dates come back as all-day. */
export async function getCalendarEvents(_calendarId, timeMin, timeMax) {
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const events = await listEvents(key(timeMin), key(timeMax))
  return events.map((e) => ({ summary: e.title, start: { date: e.date } }))
}
