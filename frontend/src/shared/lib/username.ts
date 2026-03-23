export function normalizeUsername(input: string): string {
  return input.trim().replace(/^@+/u, '').toLowerCase()
}

/** 5–32 chars, letter first (aligned with backend). */
export const USERNAME_PATTERN = /^[a-z][a-z0-9_]{4,31}$/
