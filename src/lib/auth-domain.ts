// Only Shapeshifter Google Workspace accounts get in. Google's `hd` login hint
// is a suggestion, not a check, so every entry point verifies the email here.

export const STAFF_DOMAIN = 'shapeshifterbrewing.com.au'

/** Only James can delete readings. Everyone else can log and correct them. */
export const OWNER_EMAIL = `james@${STAFF_DOMAIN}`

export function isOwnerEmail(email: string | null | undefined) {
  return !!email && email.toLowerCase() === OWNER_EMAIL
}

export function isStaffEmail(email: string | null | undefined) {
  return !!email && email.toLowerCase().endsWith(`@${STAFF_DOMAIN}`)
}
