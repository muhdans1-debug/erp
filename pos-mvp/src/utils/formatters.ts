/** BHD currency formatting — 3 decimal places (fils) */

/** Raw 3-decimal string, e.g. amount=1.5 => "1.500" */
export const formatBHD = (amount: number): string => amount.toFixed(3);

/** Full display label with currency prefix, e.g. "BD 1.500" */
export const displayBHD = (amount: number): string => 'BD ' + amount.toFixed(3);

/** Format a decimal rate as percent label, e.g. 0.10 => "10%" */
export const formatPct = (rate: number): string => (rate * 100).toFixed(0) + '%';
