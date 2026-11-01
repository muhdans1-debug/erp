import { registerPlugin } from '@capacitor/core';

export interface CustomerDisplayPlugin {
  updateDisplay(options: { text: string }): Promise<void>;
  isAvailable?(): Promise<{ available: boolean; displayCount: number }>;
}

export const CustomerDisplay = registerPlugin<CustomerDisplayPlugin>('CustomerDisplay');
