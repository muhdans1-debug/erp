// pos-mvp/src/types/pos.ts

export interface Product {
  id: string;
  barcode: string;
  name: string;
  nameAr?: string;
  name_ar?: string;
  plu_code?: string | null;
  pluCode?: string | null;
  image_url?: string | null;
  imageUrl?: string | null;
  image_url_thumb?: string | null;
  imageUrlThumb?: string | null;
  price: number;        // REPLACES sellingPrice
  sellingPrice?: number;
  unitCost: number;     // REPLACES purchasePrice
  purchasePrice?: number;
  vatRate: number;      // REPLACES taxRate
  isScaleItem: boolean; // REPLACES is_weighed_item
  is_weighed_item?: boolean | number;
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
  nfcCardId?: string | null;
  currentBalance: number;
  balance?: number;
  personalBalance?: number;
  messBalance?: number;
  creditLimit?: number;
  credit_limit?: number;
  isStale?: boolean;
  isOverLimit?: boolean;
  daysSinceLastPayment?: number;
  is_active?: number | boolean;
  isActive?: boolean;
  isFrozen?: boolean;
  isMess?: boolean;
  hasMessGroup?: boolean;
  isDual?: boolean;
  isMultiMess?: boolean;
  card_type?: string;
  card_deposit_amount?: number;
  depositAmount?: number;
  card_deposit_status?: string;
  depositStatus?: string;
  depositInCredit?: number;
  card_deposit_receipt_no?: string;
  card_deposit_date?: string;
  payday_day_of_month?: number;
  cash_advance_balance?: number;
  mess_id?: string | null;
  messName?: string | null;
  mess_name?: string | null;
  isMessGroup?: boolean;
  tag_id?: string;
  group_name?: string;
  messes?: any[];
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
