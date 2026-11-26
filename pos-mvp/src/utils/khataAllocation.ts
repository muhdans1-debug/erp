/**
 * ASKAR SUPERMARKET ERP - CLIENT KHATA PROPORTIONAL ALLOCATION ENGINE
 * Deterministically distributes payments across multi-mess room debts and isolates accounts.
 */

export interface MessDebtItem {
  id: string;
  name?: string;
  group_name?: string;
  bal?: number;
  memberShare?: number;
  myShare?: number;
}

export interface ProportionalAllocationResult {
  allocations: Record<string, number>;
  totalAllocated: number;
  surplusToPersonal: number;
  remainingDebt: Record<string, number>;
}

export function calculateProportionalMessAllocation(
  amount: number | string,
  messes: MessDebtItem[]
): ProportionalAllocationResult {
  const cleanAmount = Math.max(0, parseFloat(Number(amount || 0).toFixed(3)));
  const activeMesses = (messes || [])
    .map(m => {
      const b = Number(m.bal !== undefined ? m.bal : (m.memberShare !== undefined ? m.memberShare : (m.myShare !== undefined ? m.myShare : 0)));
      return {
        id: m.id,
        name: m.group_name || m.name || m.id,
        bal: Math.max(0, parseFloat(b.toFixed(3)))
      };
    })
    .filter(m => m.bal > 0);

  const totalMessDebt = parseFloat(activeMesses.reduce((sum, m) => sum + m.bal, 0).toFixed(3));

  if (activeMesses.length === 0 || cleanAmount <= 0) {
    const remainingDebt: Record<string, number> = {};
    for (const m of messes || []) {
      const b = Number(m.bal !== undefined ? m.bal : (m.memberShare !== undefined ? m.memberShare : (m.myShare !== undefined ? m.myShare : 0)));
      remainingDebt[m.id] = Math.max(0, parseFloat(b.toFixed(3)));
    }
    return {
      allocations: {},
      totalAllocated: 0,
      surplusToPersonal: cleanAmount,
      remainingDebt
    };
  }

  // Case 1: Full clearance or Overpayment
  if (cleanAmount >= totalMessDebt) {
    const allocations: Record<string, number> = {};
    const remainingDebt: Record<string, number> = {};
    for (const m of activeMesses) {
      allocations[m.id] = m.bal;
      remainingDebt[m.id] = 0;
    }
    const surplusToPersonal = parseFloat((cleanAmount - totalMessDebt).toFixed(3));
    return {
      allocations,
      totalAllocated: totalMessDebt,
      surplusToPersonal,
      remainingDebt
    };
  }

  // Case 2: Partial Payment (Strictly Proportional Distribution)
  const allocations: Record<string, number> = {};
  const remainingDebt: Record<string, number> = {};
  let distributedSum = 0;
  let largestDebtMessId = activeMesses[0].id;
  let maxDebt = -1;

  for (const m of activeMesses) {
    if (m.bal > maxDebt) {
      maxDebt = m.bal;
      largestDebtMessId = m.id;
    }
    const ratio = m.bal / totalMessDebt;
    const rawPortion = cleanAmount * ratio;
    const allocated = parseFloat(rawPortion.toFixed(3));
    allocations[m.id] = allocated;
    distributedSum = parseFloat((distributedSum + allocated).toFixed(3));
  }

  // Reconcile rounding remainder (±0.001 BD) onto the mess with the largest debt
  const remainder = parseFloat((cleanAmount - distributedSum).toFixed(3));
  if (remainder !== 0 && largestDebtMessId) {
    allocations[largestDebtMessId] = Math.max(0, parseFloat(((allocations[largestDebtMessId] || 0) + remainder).toFixed(3)));
  }

  // Calculate remaining balances (guaranteed >= 0)
  for (const m of activeMesses) {
    remainingDebt[m.id] = Math.max(0, parseFloat((m.bal - (allocations[m.id] || 0)).toFixed(3)));
  }

  return {
    allocations,
    totalAllocated: cleanAmount,
    surplusToPersonal: 0,
    remainingDebt
  };
}
