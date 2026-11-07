import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtMoney, fmtNumber } from "@/lib/formatters";
import { sortProducts } from "@/lib/product-sorting";

interface Item {
  product_name: string;
  quantity: number;
  total_amount: number;
}

export function CustomerProductsDrawer({
  open,
  onClose,
  customer,
  products,
}: {
  open: boolean;
  onClose: () => void;
  customer: string | null;
  products: Item[];
}) {
  const total = products.reduce((s, p) => s + p.quantity, 0);
  const sortedProducts = sortProducts(products, (p) => p.product_name);
  const totalAmt = products.reduce((s, p) => s + p.total_amount, 0);
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="left"
        className="w-full sm:max-w-lg overflow-y-auto"
        dir="rtl"
      >
        <SheetHeader>
          <SheetTitle>منتجات العميل: {customer}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-[24px] border-[3px] border-primary-light bg-cream p-4 shadow-sm">
            <p className="text-primary-dark font-bold text-xs">إجمالي الكمية</p>
            <p className="font-extrabold text-2xl text-accent-dark tabular-nums mt-1">
              {fmtNumber(total, 2)}
            </p>
          </div>
          <div className="rounded-[24px] border-[3px] border-primary-light bg-cream p-4 shadow-sm">
            <p className="text-primary-dark font-bold text-xs">إجمالي القيمة</p>
            <p className="font-extrabold text-2xl text-accent-dark tabular-nums mt-1">
              {fmtMoney(totalAmt)}
            </p>
          </div>
        </div>
        <div className="mt-6 rounded-[24px] border-[3px] border-primary-light overflow-hidden bg-white shadow-card">
          <Table>
            <TableHeader className="bg-primary-bg/50">
              <TableRow className="border-b-[3px] border-primary-light">
                <TableHead className="font-extrabold text-primary-dark">
                  الصنف
                </TableHead>
                <TableHead className="font-extrabold text-primary-dark">
                  الكمية
                </TableHead>
                <TableHead className="font-extrabold text-primary-dark">
                  القيمة
                </TableHead>
                <TableHead className="font-extrabold text-primary-dark">
                  %
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedProducts.map((p, i) => (
                <TableRow
                  key={i}
                  className="border-b border-primary-light/30 hover:bg-cream/50 transition-colors"
                >
                  <TableCell className="font-bold text-primary-dark">
                    {p.product_name}
                  </TableCell>
                  <TableCell className="font-bold tabular-nums text-primary-dark">
                    {fmtNumber(p.quantity, 2)}
                  </TableCell>
                  <TableCell className="font-bold tabular-nums text-info">
                    {fmtMoney(p.total_amount)}
                  </TableCell>
                  <TableCell className="font-bold tabular-nums text-primary-dark/70">
                    {total > 0 ? ((p.quantity / total) * 100).toFixed(1) : 0}%
                  </TableCell>
                </TableRow>
              ))}
              {!products.length && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center py-6 text-primary-dark/50 font-bold"
                  >
                    لا توجد بيانات
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </SheetContent>
    </Sheet>
  );
}
