// Copied verbatim from shapeshifter-sales/web/src/data/products.js (9 Oct 2026), apart from
// import paths. Keep in sync: the planner must agree with the Sales App's Stock page.

/**
 * Product catalog — internal SKUs, Xero item codes, and unit prices (ex-GST).
 *
 * sku            — internal identifier used in orders sheet and app UI
 * xero_item_code — Xero item code for invoice line items (null if not yet in Xero)
 * unit_price     — ex-GST price in AUD (0 = price TBC / new product not yet in Xero)
 *
 * TO UPDATE PRICES: edit unit_price values below, then redeploy.
 * TO DEACTIVATE A PRODUCT: set active: false (hides from order picker but keeps history).
 * TO ADD A PRODUCT: append a new entry following the same pattern.
 */

export const PRODUCTS = [
  // ── Can Cases (24 × 375ml) ────────────────────────────────────────────
  { sku: 'SS-LH-375',   xero_item_code: 'SSHLLH375ml',      name: 'Lemon Haze',         format: 'Can Case', size: '375ml × 24', unit_price: 102, active: true },
  { sku: 'SS-FF-375',   xero_item_code: 'SSFF01375ml',      name: "Findon's Finest",     format: 'Can Case', size: '375ml × 24', unit_price: 79,  active: true },
  { sku: 'SS-PS-375',   xero_item_code: 'SSPSSH375ml',      name: 'Party Shirt',         format: 'Can Case', size: '375ml × 24', unit_price: 102, active: true },
  { sku: 'SS-GR-375',   xero_item_code: 'SS01GRWCIPA375ml', name: 'Golden Ratio',        format: 'Can Case', size: '375ml × 24', unit_price: 105, active: true },
  { sku: 'SS-HS-375',   xero_item_code: 'SSHSHP375mL',      name: 'Headspace',           format: 'Can Case', size: '375ml × 24', unit_price: 109, active: true },
  { sku: 'SS-CS-375',   xero_item_code: 'SSCSRL375mL',      name: 'Culture Shock',       format: 'Can Case', size: '375ml × 24', unit_price: 99,  active: true },
  { sku: 'SS-DB-375',   xero_item_code: 'SSDTP375mL',       name: 'Daybreak',            format: 'Can Case', size: '375ml × 24', unit_price: 85,  active: true },
  { sku: 'SS-SPL-375',  xero_item_code: 'SSSCP375ml',       name: 'Splice',              format: 'Can Case', size: '375ml × 24', unit_price: 102, active: true },
  { sku: 'SS-MYM-375',  xero_item_code: 'SSMYM01375ml',     name: 'Make Your Move',      format: 'Can Case', size: '375ml × 24', unit_price: 105, active: true },
  { sku: 'SS-HD-375',   xero_item_code: 'SSHW375ml',        name: 'Hoodie Season',       format: 'Can Case', size: '375ml × 24', unit_price: 105, active: true },
  { sku: 'SS-WCP-375',  xero_item_code: 'SSNWP375ml',       name: 'WC Pils',             format: 'Can Case', size: '375ml × 24', unit_price: 110, active: true },
  { sku: 'SS-CRC-375',  xero_item_code: null,               name: 'Craic',               format: 'Can Case', size: '375ml × 24', unit_price: 0,   active: true },
  { sku: 'SS-SID-375',  xero_item_code: null,               name: 'Shot in Dark',        format: 'Can Case', size: '375ml × 24', unit_price: 0,   active: true },
  { sku: 'SS-SUNS-375', xero_item_code: null,               name: 'Sunshowers',          format: 'Can Case', size: '375ml × 24', unit_price: 0,   active: true },
  { sku: 'SS-IPL-375',  xero_item_code: null,               name: 'IPL',                 format: 'Can Case', size: '375ml × 24', unit_price: 0,   active: true },
  { sku: 'SS-TS-375',   xero_item_code: null,               name: 'Tiny Sour',           format: 'Can Case', size: '375ml × 24', unit_price: 0,   active: true },
  { sku: 'SS-CLW-375',  xero_item_code: null,               name: 'Cloudwater Collab',   format: 'Can Case', size: '375ml × 24', unit_price: 0,   active: true },
  { sku: 'SS-FROG-375', xero_item_code: null,               name: 'Frog OCIPA',          format: 'Can Case', size: '375ml × 24', unit_price: 0,   active: true },
  { sku: 'SS-IMP-375',  xero_item_code: null,               name: 'Imperial Stout',      format: 'Can Case', size: '375ml × 24', unit_price: 0,   active: true },
  { sku: 'SS-HVM-375',  xero_item_code: null,               name: 'Hivemind',            format: 'Can Case', size: '375ml × 24', unit_price: 0,   active: true },

  // ── Kegs — 50L ────────────────────────────────────────────────────────
  { sku: 'SS-PS-50K',   xero_item_code: 'SSPSSH0150',       name: 'Party Shirt',         format: 'Keg',      size: '50L', unit_price: 340, active: true },
  { sku: 'SS-FF-50K',   xero_item_code: 'SSFF50L',          name: "Findon's Finest",     format: 'Keg',      size: '50L', unit_price: 290, active: true },
  { sku: 'SS-GR-50K',   xero_item_code: 'SSGRWCIPA',        name: 'Golden Ratio',        format: 'Keg',      size: '50L', unit_price: 360, active: true },
  { sku: 'SS-CS-50K',   xero_item_code: 'SSCSJRL0150L',     name: 'Culture Shock',       format: 'Keg',      size: '50L', unit_price: 300, active: true },
  { sku: 'SS-DB-50K',   xero_item_code: 'SSDTP50L',         name: 'Daybreak',            format: 'Keg',      size: '50L', unit_price: 270, active: true },
  { sku: 'SS-CRC-50K',  xero_item_code: 'SSCRAIC50L',       name: 'Craic',               format: 'Keg',      size: '50L', unit_price: 350, active: true },
  { sku: 'SS-MYM-50K',  xero_item_code: 'SSMYM0150L',       name: 'Make Your Move',      format: 'Keg',      size: '50L', unit_price: 340, active: true },
  { sku: 'SS-HD-50K',   xero_item_code: 'SSHWOS0150L',      name: 'Hoodie Season',       format: 'Keg',      size: '50L', unit_price: 350, active: true },
  { sku: 'SS-SUNS-50K', xero_item_code: null,               name: 'Sunshowers',          format: 'Keg',      size: '50L', unit_price: 0,   active: true },
  { sku: 'SS-HL-50K',   xero_item_code: null,               name: 'Hard Lemonade',       format: 'Keg',      size: '50L', unit_price: 0,   active: true },
  { sku: 'SS-TS-50K',   xero_item_code: null,               name: 'Tiny Sour',           format: 'Keg',      size: '50L', unit_price: 0,   active: true },
  { sku: 'SS-FROG-50K', xero_item_code: null,               name: 'Frog OCIPA',          format: 'Keg',      size: '50L', unit_price: 0,   active: true },
  { sku: 'SS-WCP-50K',  xero_item_code: null,               name: 'WC Pils',             format: 'Keg',      size: '50L', unit_price: 0,   active: true },
  { sku: 'SS-CLW-50K',  xero_item_code: null,               name: 'Cloudwater Collab',   format: 'Keg',      size: '50L', unit_price: 0,   active: true },
  { sku: 'SS-CL-50K',   xero_item_code: 'SSBCCL50L',        name: 'Coco Loco',           format: 'Keg',      size: '50L', unit_price: 250, active: true },

  // ── Kegs — 30L ────────────────────────────────────────────────────────
  { sku: 'SS-SID-30K',  xero_item_code: 'SSCS30L',          name: 'Shot in Dark',        format: 'Keg',      size: '30L', unit_price: 265, active: true },
  { sku: 'SS-FROG-30K', xero_item_code: null,               name: 'Frog OCIPA',          format: 'Keg',      size: '30L', unit_price: 0,   active: true },
  { sku: 'SS-CLW-30K',  xero_item_code: null,               name: 'Cloudwater Collab',   format: 'Keg',      size: '30L', unit_price: 0,   active: true },
];

/** Active products only */
export function getActiveProducts() {
  return PRODUCTS.filter((p) => p.active);
}

/** Group active products: { 'Can Case': [...], 'Keg': [...] } */
export function getProductsByFormat() {
  const active = getActiveProducts();
  return active.reduce((acc, p) => {
    if (!acc[p.format]) acc[p.format] = [];
    acc[p.format].push(p);
    return acc;
  }, {});
}

/** Look up a product by internal SKU */
export function getProductBySku(sku) {
  return PRODUCTS.find((p) => p.sku === sku) ?? null;
}

/**
 * Format a line-items array as a human-readable breakdown string.
 * e.g. "3× Lemon Haze (Can Case 375ml × 24), 1× Party Shirt (Keg 50L)"
 */
export function formatOrderBreakdown(items) {
  return items
    .filter((i) => i.qty > 0)
    .map((i) => `${i.qty}× ${i.name} (${i.format}${i.size ? ' ' + i.size : ''})`)
    .join(', ');
}

/** Calculate total AUD (ex-GST) from a line-items array */
export function calcOrderTotal(items) {
  return items.filter((i) => i.qty > 0).reduce((sum, i) => sum + i.qty * i.unit_price, 0);
}
