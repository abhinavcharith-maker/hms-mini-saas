export function sanitizeMobileInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, 10);
}

export function isTenDigitMobile(value: string): boolean {
  return /^\d{10}$/.test(value.trim());
}
