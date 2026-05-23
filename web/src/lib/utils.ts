export function clsx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function errorMessage(error: unknown, fallback = 'Try again.') {
  return error instanceof Error ? error.message : fallback;
}

export function permissionLabel(name: string) {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function toNumber(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toNullableNumber(value: string) {
  const trimmed = value.trim();
  return trimmed ? toNumber(trimmed) : null;
}
