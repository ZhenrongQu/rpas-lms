import { MODULE_IDS, type ModuleId } from "../content/types";

/**
 * Allocates `total` questions across modules proportional to `weights`
 * using the largest-remainder method so the result sums exactly to `total`.
 */
export function allocateQuotas(
  total: number,
  weights: Record<ModuleId, number>,
): Record<ModuleId, number> {
  const quotas = {} as Record<ModuleId, number>;
  const remainders: { id: ModuleId; rem: number }[] = [];
  let allocated = 0;

  for (const id of MODULE_IDS) {
    const exact = total * (weights[id] ?? 0);
    const floor = Math.floor(exact);
    quotas[id] = floor;
    allocated += floor;
    remainders.push({ id, rem: exact - floor });
  }

  let remaining = total - allocated; // integer in [0, MODULE_IDS.length)
  remainders.sort((a, b) => b.rem - a.rem);
  for (let i = 0; i < remaining; i++) {
    quotas[remainders[i].id] += 1;
  }
  return quotas;
}
