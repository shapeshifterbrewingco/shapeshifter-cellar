// Hard lemonade and its relatives are made, not brewed: no mash, no yeast, no
// fermentation. The brew sheet, the stages and the excise return all treat
// them differently, so the test for "is this one" lives in one place.

/** True for a hard lemonade, seltzer or anything else labelled an RTD. */
export const isRtd = (name: string | null | undefined, style: string | null | undefined) =>
  /lemonade|seltzer|\brtd\b/i.test(`${name ?? ''} ${style ?? ''}`)
