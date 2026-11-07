import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtNumber } from "@/lib/formatters";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface CategoryEntry {
  name: string;
  value: number;
  color: string;
}

interface HistoryEntry {
  date: string;
  sales: number;
  collected: number;
}

interface Props {
  categoryDistribution: CategoryEntry[];
  historyChart: HistoryEntry[];
}

export function ReportChartsSection({
  categoryDistribution,
  historyChart,
}: Props) {
  const totalCategoryQty = categoryDistribution.reduce(
    (acc, curr) => acc + curr.value,
    0,
  );

  return (
    <div className="grid md:grid-cols-2 gap-4 print:grid-cols-2 print:gap-2">
      {/* Donut Chart: Sales Distribution */}
      <Card className="shadow-card border-0 rounded-[24px] bg-card overflow-hidden">
        <CardHeader className="pb-4 border-b-[3px] border-dashed border-primary/20 mb-4">
          <CardTitle className="text-xl font-extrabold flex items-center justify-between w-full text-primary-dark">
            <span className="flex items-center gap-2">
              <div className="text-2xl flex items-center justify-center">📈</div>
              <span>توزيع المبيعات (خامات / أعلاف)</span>
              <div className="text-2xl flex items-center justify-center">📊</div>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent
          style={{ height: 260 }}
          className="flex flex-col justify-between"
        >
          {categoryDistribution.length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
              لا توجد بيانات كافية للتصنيف
            </div>
          ) : (
            <div className="w-full h-full flex flex-col justify-center relative">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={categoryDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={85}
                    paddingAngle={6}
                    dataKey="value"
                    stroke="none"
                    cornerRadius={4}
                  >
                    {categoryDistribution.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid hsl(var(--border))",
                      backgroundColor: "hsl(var(--background))",
                    }}
                    itemStyle={{ fontWeight: "bold", fontSize: "13px" }}
                    formatter={(value: number) => [
                      `${fmtNumber(value, 2)} كيلو`,
                      "الكمية",
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-7">
                <span className="text-lg font-black text-foreground tabular-nums">
                  {fmtNumber(totalCategoryQty, 0)}
                </span>
                <span className="text-[10px] text-muted-foreground font-semibold">
                  كيلو
                </span>
              </div>
              {/* Custom Legend underneath chart */}
              <div className="flex items-center justify-center gap-6 text-sm font-bold mt-1">
                {categoryDistribution.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-2">
                    <span
                      className="w-3.5 h-3.5 rounded-sm shrink-0"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="text-muted-foreground text-xs font-bold">
                      {entry.name} ({fmtNumber(entry.value, 1)} كيلو)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* History Chart */}
      <Card className="shadow-card border-0 rounded-[24px] bg-card overflow-hidden">
        <CardHeader className="pb-4 border-b-[3px] border-dashed border-primary/20 mb-4">
          <CardTitle className="text-xl font-extrabold flex items-center justify-between w-full text-primary-dark">
            <span className="flex items-center gap-2">
              <div className="text-2xl flex items-center justify-center">📈</div>
              <span>اتجاه المبيعات والتحصيل</span>
              <div className="text-2xl flex items-center justify-center">📈</div>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={historyChart}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00E5FF" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#00E5FF" stopOpacity={0} />
                </linearGradient>
                <linearGradient
                  id="colorCollected"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="5%" stopColor="#30D158" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#30D158" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#2C2C2E" vertical={false} />
              <XAxis
                dataKey="date"
                reversed
                tick={{
                  fontSize: 12,
                  fill: "hsl(var(--muted-foreground))",
                }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                tick={{
                  fontSize: 12,
                  fill: "hsl(var(--muted-foreground))",
                }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid hsl(var(--border))",
                  backgroundColor: "hsl(var(--background))",
                }}
                itemStyle={{ fontWeight: "bold", fontSize: "13px" }}
                formatter={(value: number) => [
                  `${value.toLocaleString()} ج.م`,
                  undefined,
                ]}
                labelStyle={{
                  color: "hsl(var(--muted-foreground))",
                  marginBottom: "4px",
                  fontSize: "13px",
                }}
              />
              <Legend
                iconType="circle"
                wrapperStyle={{ fontSize: 12, fontWeight: "bold" }}
              />
              <Area
                type="monotone"
                dataKey="sales"
                stroke="#00E5FF"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorSales)"
                name="المبيعات"
              />
              <Area
                type="monotone"
                dataKey="collected"
                stroke="#30D158"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorCollected)"
                name="التحصيل"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
