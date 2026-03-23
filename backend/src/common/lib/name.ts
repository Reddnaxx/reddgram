/** Trim; collapse internal whitespace. */
export function normalizePersonName(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}
