export interface Product {
  id: string;
  name: string;
  sellingPrice: number;
  price?: number;
  purchasePrice?: number;
  unitCost?: number;
  vatRate?: number; // 10 for standard, 0 for zero-rated basic foods
  taxRate?: number;
  barcode?: string;
  quantity?: number;
  stockQuantity?: number;
  productId?: string;
  isScaleItem?: boolean;
  scaleWeight?: number;
  category?: string;
  isQuickProduct?: boolean;
  originalPrice?: number;
  discountNote?: string;
  is_weighed_item?: boolean;
  total_price?: number;
}

export interface CartTab {
  id: string;
  name: string;
  items: Product[];
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

