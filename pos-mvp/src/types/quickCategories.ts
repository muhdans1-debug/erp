export interface QuickCategory {
  id: string;
  label: string;
  color?: string; // emerald, amber, sky, rose, purple, slate, teal, orange
}

export const DEFAULT_CATEGORIES: QuickCategory[] = [
  { id: 'ALL', label: 'All Items', color: 'slate' },
  { id: 'PRODUCE', label: 'Produce 🥦', color: 'emerald' },
  { id: 'BAKERY', label: 'Bakery 🥖', color: 'amber' },
  { id: 'DAIRY', label: 'Dairy 🥛', color: 'sky' },
  { id: 'MEAT', label: 'Meat / Deli 🥩', color: 'rose' },
  { id: 'ESSENTIALS', label: 'Essentials ⚡', color: 'slate' }
];
