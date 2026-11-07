// pos-mvp/src/types/pos.ts

export interface Product {
  id: string;
  barcode: string;
  name: string;
  nameAr?: string;
  price: number;        // REPLACES sellingPrice
  unitCost: number;     // REPLACES purchasePrice
  vatRate: number;      // REPLACES taxRate
  isScaleItem: boolean; // REPLACES is_weighed_item
  stockQuantity: number;
  category?: string;
  isQuickProduct?: boolean;
  scaleWeight?: number;
  originalPrice?: number;
  discountNote?: string;
  productId?: string;
  total_price?: number;
}

export interface CartItem extends Product {
  qty: number;          // REPLACES quantity
}

export interface CartTab {
  id: string;
  name: string;
  items: CartItem[];
}

export interface Customer {
  id: string;
  name: string;
  phone?: string | null;
  cpr?: string | null;
  cardUid?: string | null;
  currentBalance: number;
  balance?: number;
  personalBalance?: number;
  creditLimit?: number;
  isStale?: boolean;
  isOverLimit?: boolean;
  daysSinceLastPayment?: number;
  isMess?: boolean;
  hasMessGroup?: boolean;
  isDual?: boolean;
  card_type?: string;
  mess_id?: string;
  tag_id?: string;
  group_name?: string;
  messGroup?: {
    id: string;
    group_name: string;
    members: any[];
    memberCount: number;
    totalBalance?: number;
  };
  members?: any[];
  memberCount?: number;
  shopper?: {
    id: string;
    name: string;
  };
}

export interface CreditLimitBlockedInfo {
  customer: Customer;
  currentBalance: number;
  saleAmount: number;
  projectedBalance: number;
  creditLimit: number;
  exceededBy: number;
}

export interface PriceOverrideItem {
  index: number;
  product: Product;
}
