export interface CustomerProductItem {
  customer_name: string;
  product_name: string;
  quantity: number;
  total_amount: number;
  unit_price?: number;
}

export interface DailyPricingProps {
  reportDate: string;
  customerProducts: CustomerProductItem[];
  customersList?: Array<{
    customer_name: string;
    sales_amount: number;
    total_qty?: number;
  }>;
}

export interface ProductStat {
  product: string;
  minPrice: number;
  minCustomer: string;
  maxPrice: number;
  maxCustomer: string;
  avgPrice: number;
  totalQty: number;
  totalAmount: number;
  hasPriceSpread: boolean;
}

export interface CustomerMatrixRow {
  name: string;
  products: Map<string, { qty: number; total: number; price: number }>;
  totalSales: number;
  totalQty: number;
}

export interface DailyPricingKpis {
  totalCustomers: number;
  totalSales: number;
  avgPrice: number;
  highestPrice: number;
  lowestPrice: number;
  topProduct: string;
  topCustomer: string;
}

export interface ProcessedPricingData {
  products: string[];
  customers: CustomerMatrixRow[];
  productStats: Map<string, ProductStat>;
  kpis: DailyPricingKpis;
}

// The exact specified commodities in standard display order
export const TARGET_PRICING_PRODUCTS = [
  "ذرة صفراء",
  "نخالة",
  "صويا 46%",
  "رجيعة",
  "دي دي جي",
  "كسب النور",
];

export function normalizeRawProductName(raw: string): string {
  return raw
    .trim()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/٤/g, "4")
    .replace(/٦/g, "6")
    .replace(/٪/g, "%")
    .toLowerCase();
}

export function mapToTargetPricingProduct(rawName: string): string | null {
  if (!rawName) return null;
  const norm = normalizeRawProductName(rawName);

  // 1. Check for Full Fat Soy (صويا فولفات) - MUST NEVER BE CLASSIFIED AS صويا 46%
  const isFullFat =
    norm.includes("فولفات") ||
    norm.includes("فول فات") ||
    norm.includes("فولفيت") ||
    norm.includes("fullfat") ||
    norm.includes("full fat") ||
    norm.includes("full_fat");

  if (isFullFat) {
    // صويا فولفات منتج منفصل تماماً عن صويا 46 ولا يدخل معه نهائياً
    return null;
  }

  // 2. Check for Soy 44% (صويا 44%) - Exclude from 46%
  if (norm.includes("44") && (norm.includes("صويا") || norm.includes("فول"))) {
    return null;
  }

  // 3. Exact matching for صويا 46% (فول صويا 46% / كسب صويا 46%)
  if (
    norm.includes("46") &&
    (norm.includes("صويا") || norm.includes("فول") || norm.includes("كسب"))
  ) {
    return "صويا 46%";
  }

  // 4. Exact matching for ذرة صفراء (Yellow Corn)
  const isCornExcluded =
    norm.includes("بذر") ||
    norm.includes("بزر") ||
    norm.includes("كتان") ||
    norm.includes("جلوتين") ||
    norm.includes("جنين") ||
    norm.includes("قشر") ||
    norm.includes("كسب") ||
    norm.includes("نشا") ||
    norm.includes("زيت") ||
    norm.includes("مستخلص") ||
    norm.includes("ابيض") ||
    norm.includes("بيضاء") ||
    norm.includes("فشار") ||
    norm.includes("سيلاج") ||
    norm.includes("علف");

  if (!isCornExcluded) {
    if (
      norm.includes("ذره صفراء") ||
      norm.includes("ذرة صفراء") ||
      norm.includes("ذره ارجنتين") ||
      norm.includes("ذرة ارجنتين") ||
      norm.includes("ذره برازيل") ||
      norm.includes("ذرة برازيل") ||
      norm.includes("ذره اوكران") ||
      norm.includes("ذرة اوكران") ||
      norm.includes("ذره صب") ||
      norm.includes("ذرة صب") ||
      norm.includes("ذره مستورد") ||
      norm.includes("ذرة مستورد") ||
      norm.includes("ذره محلي") ||
      norm.includes("ذرة محلي") ||
      norm === "ذره" ||
      norm === "ذرة" ||
      norm === "الذره" ||
      norm === "الذرة" ||
      norm.startsWith("ذره ") ||
      norm.startsWith("ذرة ") ||
      norm.endsWith(" ذره") ||
      norm.endsWith(" ذرة")
    ) {
      return "ذرة صفراء";
    }
  }

  // 5. Exact matching for نخالة (Wheat Bran / ردة)
  if (
    (norm.includes("نخال") || norm.includes("رده") || norm.includes("ردة")) &&
    !norm.includes("علف") &&
    !norm.includes("مركز")
  ) {
    return "نخالة";
  }

  // 6. Exact matching for رجيعة (Rice Bran / رجيع كون)
  if (norm.includes("رجيع") && !norm.includes("علف")) {
    return "رجيعة";
  }

  // 7. Exact matching for دي دي جي (DDGS)
  if (norm.includes("دي دي") || norm.includes("ddg")) {
    return "دي دي جي";
  }

  // 8. Exact matching for كسب النور (Sunflower/linseed meal / كسب)
  const isFinishedFeed =
    norm.includes("علف") ||
    norm.includes("تسمين") ||
    norm.includes("حلاب") ||
    norm.includes("بياض") ||
    norm.includes("بادئ") ||
    norm.includes("نامي") ||
    norm.includes("ناهي") ||
    norm.includes("دواجن") ||
    norm.includes("مواشي");

  const isSoy = norm.includes("صويا") || norm.includes("فول");

  if (!isFinishedFeed && !isSoy) {
    if (
      norm.includes("كسب النور") ||
      norm.includes("كسب عباد") ||
      norm.includes("كسب بذره") ||
      norm.includes("كسب بذرة") ||
      norm.includes("كسب قطن") ||
      norm.includes("كسب سمسم") ||
      norm === "كسب"
    ) {
      return "كسب النور";
    }
  }

  return null;
}
