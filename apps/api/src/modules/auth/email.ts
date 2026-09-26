/** Authentication uses one canonical email representation for lookup and persistence. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
