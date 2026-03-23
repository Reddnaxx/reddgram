export function normalizeUsername(input: string): string {
  return input.trim().replace(/^@+/u, '').toLowerCase();
}

export const USERNAME_PATTERN = /^[a-z][a-z0-9_]{4,31}$/;
