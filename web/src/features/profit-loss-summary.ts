export function lossAmount(value: number | null | undefined): number {
  return Math.max(-Number(value ?? 0), 0);
}
