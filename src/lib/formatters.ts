export function fmtMoney(n: number) {
  return (
    new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
      n || 0,
    ) + " ج.م"
  );
}
export function fmtNumber(n: number, digits = 0) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
  }).format(n || 0);
}
export function fmtPct(n: number) {
  return ((n || 0) * 100).toFixed(1) + "%";
}
