export const PHONE_MIN_DIGITS = 10

export function normalizePhone(input: string): string {
  return input.replace(/\D/g, '')
}
