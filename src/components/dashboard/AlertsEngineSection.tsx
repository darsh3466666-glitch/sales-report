import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface AlertItem {
  title: string;
  msg: string;
  type: "danger" | "warning" | "info";
}

interface Props {
  alerts: AlertItem[];
}

export function AlertsEngineSection({ alerts }: Props) {
  return (
    <Card className="shadow-card border-0 rounded-[24px] bg-card overflow-hidden">
      <CardHeader className="pb-4 border-b-[3px] border-dashed border-primary/20 mb-4">
        <CardTitle className="text-xl font-extrabold flex items-center gap-2 text-primary-dark">
          <div className="text-2xl flex items-center justify-center">🔔</div>
          <span>محرك التنبيهات</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!alerts.length && (
          <p className="text-muted-foreground text-sm font-semibold">
            لا توجد تنبيهات حرجة. الأمور تسير بشكل طبيعي.
          </p>
        )}
        <div className="grid md:grid-cols-2 gap-3 print:grid-cols-2">
          {alerts.map((a) => (
            <div
              key={a.title}
              className={`p-3 rounded-xl border-0 border-r-[6px] flex gap-3 shadow-sm ${
                a.type === "danger"
                  ? "border-r-coral bg-coral/10 text-coral-dark shadow-coral-glow"
                  : a.type === "warning"
                    ? "border-r-accent bg-accent/10 text-accent-dark shadow-accent-glow"
                    : "border-r-info bg-info/10 text-info"
              }`}
            >
              <div className="text-sm">
                <p className="font-extrabold text-base">{a.title}</p>
                <p className="opacity-90 font-medium mt-1">{a.msg}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
