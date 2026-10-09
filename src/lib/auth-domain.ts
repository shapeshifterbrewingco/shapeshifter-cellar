// Only Shapeshifter Google Workspace accounts get in. Google's `hd` login hint
// is a suggestion, not a check, so every entry point verifies the email here.

export const STAFF_DOMAIN = 'shapeshifterbrewing.com.au'

export function isStaffEmail(email: string | null | undefined) {
  return !!email && email.toLowerCase().endsWith(`@${STAFF_DOMAIN}`)
}
