/**
 * Admins can paste either a bare Google Analytics measurement ID or the whole
 * gtag snippet from the GA admin UI — we extract the ID and render the
 * official loader ourselves, so no admin-supplied script is ever injected.
 */
export function extractGaId(input: string): string | null {
  const match = input.match(/\b(?:G|GT|AW)-[A-Z0-9]{4,}\b/i);
  return match ? match[0].toUpperCase() : null;
}
