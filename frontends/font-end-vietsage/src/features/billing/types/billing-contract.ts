export type BillingPage<TItem> = {
  page: number;
  limit: number;
  total: number;
  items: TItem[];
};

export type MoneyValue = string | number;

export type FolioSummary = {
  id?: string;
  hotelId?: string;
  stayId?: string;
  folioNumber?: string;
  status?: string;
  currency?: string;
  subtotal: MoneyValue;
  tax: MoneyValue;
  discount: MoneyValue;
  total: MoneyValue;
  itemCount: number;
  serviceCount?: number;
  roomChargeCount?: number;
  isStale?: boolean;
  requiresRecalculation?: boolean;
  hasDuplicateOpenFolios?: boolean;
};

export type FolioListItem = FolioSummary & {
  id: string;
  invoiceId?: string | null;
  billId?: string | null;
  invoice?: { id?: string | null; invoiceNumber?: string | null } | null;
  subtotalAmount?: MoneyValue;
  taxAmount?: MoneyValue;
  discountAmount?: MoneyValue;
  totalAmount?: MoneyValue;
  openedAt?: string | null;
  createdAt?: string | null;
  room?: { id?: string; roomNumber?: string | null } | null;
  stay?: { id?: string; guestNameSnapshot?: string | null; status?: string | null } | null;
};

export type FolioItem = {
  id: string;
  itemType: string;
  nameSnapshot: string;
  quantity: number;
  unitPriceSnapshot: MoneyValue;
  subtotalSnapshot: MoneyValue;
  taxAmountSnapshot?: MoneyValue;
  discountAmountSnapshot?: MoneyValue;
  totalSnapshot: MoneyValue;
  currency: string;
  postedAt?: string | null;
};

export type Invoice = {
  id: string;
  hotelId: string;
  folioId: string;
  stayId: string;
  invoiceNumber: string;
  status: string;
  currency: string;
  subtotalAmount: MoneyValue;
  taxAmount: MoneyValue;
  discountAmount: MoneyValue;
  totalAmount: MoneyValue;
  paidAmount?: MoneyValue;
  balanceAmount?: MoneyValue;
  invoiceSnapshotJson?: unknown;
  issuedAt?: string | null;
  paidAt?: string | null;
};

export type InvoiceDetail = {
  invoice: Invoice;
  folio: {
    id: string;
    folioNumber: string;
    status: string;
  };
  stay: {
    id: string;
    guestName: string | null;
    roomNumber: string | null;
    checkInAt: string | null;
    checkOutAt: string | null;
  };
  items: Array<{
    id: string;
    type: string;
    name: string;
    quantity: number;
    unitPrice: MoneyValue;
    subtotal: MoneyValue;
    taxAmount: MoneyValue;
    discountAmount: MoneyValue;
    total: MoneyValue;
    postedAt: string | null;
  }>;
  payments: Array<{
    id: string;
    status: string;
    method: string;
    amount: MoneyValue;
    paidAmount: MoneyValue;
    confirmedAt: string | null;
  }>;
};

export type Payment = {
  id: string;
  hotelId: string;
  invoiceId: string;
  folioId: string;
  stayId: string;
  paymentNumber: string;
  status: string;
  provider: string;
  method: string;
  currency: string;
  amount: MoneyValue;
  paidAmount?: MoneyValue;
  providerSessionId?: string | null;
  providerPaymentId?: string | null;
  paymentUrl?: string | null;
  confirmedAt?: string | null;
};
