import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtMoney, fmtNumber } from "@/lib/formatters";

export interface ProductSaleItem {
  name: string;
  qty: number;
  salesQty?: number;
  mfgQty?: number;
  amount: number;
  color: string;
}

interface Props {
  productSalesData: ProductSaleItem[];
  productMaxQty: number;
  inventory?: Array<{ item_name: string; balance: number; unit: string }>;
}

export function TopProductsSection({
  productSalesData,
  productMaxQty,
  inventory = [],
}: Props) {
  return (
    <Card className="shadow-card border-0 rounded-[24px] bg-card overflow-hidden">
      <CardHeader className="pb-4 border-b-[3px] border-dashed border-primary/20 mb-4">
        <CardTitle className="text-xl font-extrabold flex items-center gap-2 text-primary-dark">
          <div className="text-2xl flex items-center justify-center">📦</div>
          <span>تفصيل المنتجات (كميات وقيم)</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 py-2">
        {productSalesData.length === 0 ? (
          <div className="flex justify-center text-muted-foreground text-sm">
            لا توجد مبيعات أصناف
          </div>
        ) : (
          <div className="space-y-2" dir="rtl">
            {productSalesData.map((p) => {
              const percentage = (p.qty / (productMaxQty || 1)) * 100;
              const invItem = inventory.find(
                (inv) => inv.item_name.trim() === p.name.trim(),
              );

              return (
                <div
                  key={p.name}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 p-2 bg-transparent hover:bg-cream/50 rounded-lg transition-colors border-b last:border-0 border-border pb-2"
                >
                  {/* Name - Right aligned */}
                  <div className="w-full sm:w-48 text-right shrink-0 flex flex-col justify-center gap-0.5">
                    <span
                      className="font-bold text-sm text-foreground truncate"
                      title={p.name}
                    >
                      {p.name}
                    </span>
                    {invItem ? (
                      <span className="text-[13px] font-bold text-primary-dark/80 truncate">
                        رصيد:{" "}
                        <span className="tabular-nums font-black text-[#5D4037] text-[15px]">
                          {fmtNumber(invItem.balance, 1)}
                        </span>{" "}
                        {invItem.unit}
                      </span>
                    ) : null}
                  </div>

                  {/* Bar - Middle */}
                  <div className="flex-1 h-7 bg-muted/50 rounded-full overflow-hidden relative flex flex-row-reverse items-center justify-start shadow-inner">
                    <div
                      className="h-full rounded-full flex items-center justify-end px-3 font-extrabold text-[11px] sm:text-xs text-white shadow-sm transition-all duration-500 shrink-0"
                      style={{
                        width: `${percentage}%`,
                        backgroundColor: p.color,
                        minWidth: p.qty > 0 ? "80px" : "0px",
                        textShadow: "0 1px 2px rgba(0,0,0,0.2)",
                      }}
                    >
                      <span className="tabular-nums font-black whitespace-nowrap">
                        {fmtNumber(p.qty, 1)} كيلو
                      </span>
                    </div>
                  </div>

                  {/* Value - Left aligned */}
                  <div className="w-full sm:w-32 text-left font-extrabold text-sm text-primary-dark shrink-0 flex items-center justify-end gap-1 tabular-nums">
                    <span>{fmtMoney(p.amount)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
