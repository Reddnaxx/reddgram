/** Trim; collapse internal whitespace (как на бэкенде). */
export function normalizePersonName(input: string): string {
  return input.trim().replace(/\s+/g, ' ')
}

/** Буквы (в т.ч. кириллица), пробел, дефис, апостроф. */
export const PERSON_NAME_PATTERN = /^[\p{L}\p{M}\s'-]+$/u
