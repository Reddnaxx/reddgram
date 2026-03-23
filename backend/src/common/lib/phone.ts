export function normalizePhone(input: string): string {
  return input.replace(/\D/g, '');
}

export const PHONE_MIN_DIGITS = 10;
export const PHONE_MAX_DIGITS = 15;

/** Trimmed query contains only typical phone formatting characters and at least one digit. */
export function isPhoneLikeSearchQuery(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  if (!/^[\d\s+().\-]*$/u.test(t)) return false;
  return normalizePhone(t).length > 0;
}

export function isFullPhoneDigitLength(digits: string): boolean {
  return (
    digits.length >= PHONE_MIN_DIGITS && digits.length <= PHONE_MAX_DIGITS
  );
}
