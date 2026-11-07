import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { fmtMoney } from "@/lib/formatters";
import { updateOpeningBalance } from "@/lib/reports.functions";

interface Props {
  reportId: string;
  value: number;
  onUpdated: () => void;
  readOnly?: boolean;
}

export function OpeningBalanceEditor({
  reportId,
  value,
  onUpdated,
  readOnly = false,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(value || 0));
  const [saving, setSaving] = useState(false);
  const isMounted = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    setVal(String(value || 0));
  }, [value]);

  if (readOnly) {
    return (
      <div className="text-xs sm:text-sm px-3.5 py-1.5 rounded-full border border-primary/20 bg-card shadow-xs flex items-center gap-2">
        <span className="text-muted-foreground font-medium">
          المديونية القديمة:
        </span>
        <span className="font-extrabold tabular-nums text-foreground">
          {fmtMoney(value || 0)}
        </span>
      </div>
    );
  }

  async function save() {
    const num = parseFloat(val);
    if (isNaN(num) || num < 0) {
      toast.error("قيمة غير صحيحة");
      return;
    }
    setSaving(true);
    try {
      await updateOpeningBalance({ data: { reportId, openingBalance: num } });
      toast.success("تم تحديث المديونية القديمة");
      if (isMounted.current) {
        setEditing(false);
        onUpdated();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل التحديث");
    } finally {
      if (isMounted.current) {
        setSaving(false);
      }
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-xs sm:text-sm px-3 py-1.5 rounded-md border bg-card hover:bg-muted/50 transition flex items-center gap-2 cursor-pointer"
      >
        <span className="text-muted-foreground">المديونية القديمة:</span>
        <span className="font-bold tabular-nums">{fmtMoney(value || 0)}</span>
        <span className="text-accent text-[10px] font-semibold">(تعديل)</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={0}
        step="0.01"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        className="w-40 px-2 py-1.5 text-sm border rounded-md bg-background focus:outline-hidden focus:ring-2 focus:ring-primary/40"
        placeholder="المديونية القديمة"
      />
      <Button size="sm" onClick={save} disabled={saving}>
        حفظ
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setEditing(false);
          setVal(String(value || 0));
        }}
      >
        إلغاء
      </Button>
    </div>
  );
}
