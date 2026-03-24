export const PHONE_MIN_DIGITS = 10

export function normalizePhone(input: string): string {
  let digits = input.replace(/\D/g, '');

  // Обрезаем ведущие 8/7, если номер длиннее 10 цифр
  if (digits.length >= 11 && (digits[0] === '7' || digits[0] === '8')) {
    digits = digits.slice(1);
  }

  // Обрабатываем только если хватает цифр
  if (digits.length !== 10) {
    return digits;
  }

  // Форматируем: +7 (XXX) XXX-XX-XX
  return `+7 (${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6,8)}-${digits.slice(8,10)}`;
}
