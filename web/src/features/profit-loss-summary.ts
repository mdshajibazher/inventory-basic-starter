export function lossAmount(value: number | null | undefined): number {
  return Math.max(-Number(value ?? 0), 0);
}

export function cogsReduction(summary: {
  return_cost?: number | null;
  purchase_return_cost?: number | null;
} | null | undefined): number {
  return Number(summary?.return_cost ?? 0) + Number(summary?.purchase_return_cost ?? 0);
}
