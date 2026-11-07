// Shared parser types
export interface ParsedReport {
  reportDate: string; // ISO date
  totals: {
    totalSales: number;
    totalCollected: number;
    collectionRate: number;
    totalQty: number;
    rawMaterialQty: number;
    feedQty: number;
    customerCount: number;
    invoiceCount: number;
    averageInvoice: number;
    totalReceivables: number;
  };
  customers: Array<{
    id: string;
    customer_name: string;
    sales_amount: number;
    collected_amount: number;
    prev_balance: number;
    outstanding_amount: number;
    collection_ratio: number;
    invoice_count: number;
    total_qty: number;
    risk_score: number;
    status: string;
    is_new?: boolean;
  }>;
  customerProducts: Array<{
    customer_name: string;
    product_name: string;
    quantity: number;
    total_amount: number;
    unit_price?: number;
  }>;
  productAggregates: Array<{
    product_name: string;
    total_qty: number;
    sales_qty?: number;
    mfg_qty?: number;
    total_amount: number;
    category: string;
  }>;
  inventory?: Array<{
    item_name: string;
    balance: number;
    unit: string;
  }>;
  invoices: Array<{
    invoice_no: string | null;
    invoice_date: string | null;
    customer_name: string | null;
    item_name: string | null;
    quantity: number | null;
    unit_price: number | null;
    total_amount: number | null;
  }>;
}

export const EXCLUDED_CUSTOMERS = ["تصنيع", "عمال", "نقل"];

export function isExcludedCustomer(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = String(name).trim();
  return EXCLUDED_CUSTOMERS.some((ex) => n.includes(ex));
}
