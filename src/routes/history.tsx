import React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listReports, deleteReport } from "@/lib/reports.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtMoney, fmtPct } from "@/lib/formatters";
import { ArrowRight, Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/history")({
  ssr: false,
  component: HistoryPage,
});

function HistoryPage() {
  const navigate = useNavigate();
  const { data, refetch, isLoading } = useQuery({
    queryKey: ["allReports"],
    queryFn: () => listReports(),
  });

  const isMounted = React.useRef(false);
  React.useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  async function remove(id: string, date: string) {
    if (!confirm(`حذف تقرير ${date}؟`)) return;
    try {
      await deleteReport({ data: { reportId: id } });
      if (isMounted.current) {
        toast.success("تم الحذف");
        refetch();
      }
    } catch (e) {
      if (isMounted.current) {
        toast.error(e instanceof Error ? e.message : "فشل الحذف");
      }
    }
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold">سجل التقارير</h1>
          <Button
            variant="ghost"
            onClick={() => navigate({ to: "/dashboard" })}
          >
            <ArrowRight className="h-4 w-4 ml-1" />
            الرئيسية
          </Button>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle>كل التقارير</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p>جاري التحميل...</p>
            ) : (
              <div className="overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>التاريخ</TableHead>
                      <TableHead>المبيعات</TableHead>
                      <TableHead>التحصيل</TableHead>
                      <TableHead>النسبة</TableHead>
                      <TableHead>الذمم</TableHead>
                      <TableHead>الكميات</TableHead>
                      <TableHead>العملاء</TableHead>
                      <TableHead>إجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.map((r) => (
                      <TableRow key={r.id} className="hover:bg-muted/30">
                        <TableCell className="font-medium text-right py-3">
                          {r.report_date}
                        </TableCell>
                        <TableCell className="tabular-nums font-semibold text-right">
                          {fmtMoney(r.total_sales)}
                        </TableCell>
                        <TableCell className="tabular-nums font-semibold text-success text-right">
                          {fmtMoney(r.total_collected)}
                        </TableCell>
                        <TableCell className="tabular-nums font-semibold text-right">
                          {fmtPct(r.collection_rate)}
                        </TableCell>
                        <TableCell className="tabular-nums font-semibold text-destructive text-right">
                          {fmtMoney(r.total_receivables)}
                        </TableCell>
                        <TableCell className="tabular-nums font-semibold text-right">
                          {r.total_qty.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </TableCell>
                        <TableCell className="tabular-nums font-semibold text-right">
                          {r.customer_count}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                navigate({
                                  to: "/dashboard",
                                  search: { reportId: r.id } as any,
                                })
                              }
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => remove(r.id, r.report_date)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!data?.length && (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          className="text-center py-8 text-muted-foreground"
                        >
                          لا توجد تقارير
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
