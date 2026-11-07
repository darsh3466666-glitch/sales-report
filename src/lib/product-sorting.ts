export const PRODUCT_ORDER = [
  "ذرة صفراء",
  "نخالة",
  "كسب",
  "فول صويا ٤٤٪",
  "دي دي جي إس",
  "فول صويا ٤٦٪",
  "صويا فولفات",
  "رجيع كون",
  "جلوتوفيد",
  "علف النور تسمين",
  "علف النور حلاب",
  "كربونات البوتاسيوم",
  "بريمكس تسمين",
  "أملاح معدنية حلاب",
  "فيتامينات حلاب",
  "حجر جيري",
  "ثنائي فوسفات الكالسيوم",
  "أحادي فوسفات الكالسيوم",
  "ملح طعام",
  "مضاد سموم بيولوجي",
  "مضاد سموم كيميائي",
  "خميرة",
  "أكسيد الماغنسيوم",
  "بيكربونات الصوديوم",
  "م. التصنيع",
  "م. العمال",
  "م. النقل",
];

function normalizeProductName(name: string) {
  let s = name
    .replace(/أ/g, "ا")
    .replace(/إ/g, "ا")
    .replace(/آ/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/4/g, "٤")
    .replace(/6/g, "٦")
    .replace(/%/g, "٪");

  s = s
    .split(/\s+/)
    .map((w) => {
      let word = w.replace(/^م\./, "");
      if (word.startsWith("ال")) word = word.substring(2);
      return word;
    })
    .join("");

  s = s.replace(/[^\u0621-\u064A0-9٤٦٪a-zA-Z]/g, "");

  if (s === "ديديجي") s = "ديديجياس";
  if (s.includes("رجيع")) s = "رجيعكون";

  return s;
}

const NORMALIZED_ORDER = PRODUCT_ORDER.map(normalizeProductName);

export function getProductSortIndex(productName: string): number {
  if (!productName) return 999;
  const normalized = normalizeProductName(productName);

  const index = NORMALIZED_ORDER.indexOf(normalized);
  if (index !== -1) return index;

  for (let i = 0; i < NORMALIZED_ORDER.length; i++) {
    if (
      normalized.includes(NORMALIZED_ORDER[i]) ||
      NORMALIZED_ORDER[i].includes(normalized)
    ) {
      return i;
    }
  }

  return 999;
}

export function sortProducts<T>(products: T[], getName: (p: T) => string): T[] {
  return [...products].sort((a, b) => {
    const nameA = getName(a) || "";
    const nameB = getName(b) || "";

    const indexA = getProductSortIndex(nameA);
    const indexB = getProductSortIndex(nameB);

    if (indexA !== indexB) {
      return indexA - indexB;
    }

    return nameA.localeCompare(nameB, "ar");
  });
}
