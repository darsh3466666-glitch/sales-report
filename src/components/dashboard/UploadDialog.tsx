import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Upload, Loader2, CloudDownload } from "lucide-react";
import { parseAndImportReport } from "@/lib/excel-parser.functions";
import { forceInjectFromDrive } from "@/lib/auto-inject";

interface Props {
  onUploaded: () => void;
}

function fileToB64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const result = r.result as string;
      resolve(result.split(",")[1]);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}

export function UploadDialog({ onUploaded }: Props) {
  const [collections, setCollections] = useState<File | null>(null);
  const [invoices, setInvoices] = useState<File | null>(null);
  const [inventory, setInventory] = useState<File | null>(null);
  const [date, setDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [loading, setLoading] = useState(false);
  const collectionsRef = useRef<HTMLInputElement>(null);
  const invoicesRef = useRef<HTMLInputElement>(null);
  const inventoryRef = useRef<HTMLInputElement>(null);
  const isMounted = useRef(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  async function handleForceSync() {
    setSyncing(true);
    try {
      await forceInjectFromDrive();
      toast.success("تم تحديث البيانات من جوجل درايف بنجاح");
      if (isMounted.current) {
        onUploaded();
      }
    } catch (e: any) {
      toast.error("فشل التحديث من جوجل درايف: " + e.message);
    } finally {
      if (isMounted.current) {
        setSyncing(false);
      }
    }
  }

  async function handleUpload() {
    if (!collections || !invoices) {
      toast.error(
        "يرجى رفع ملف فواتير اليوم لأن التقرير لا يمكن تكوينه بدقة بدونه.",
      );
      return;
    }
    setLoading(true);
    try {
      const [c, i, inv] = await Promise.all([
        fileToB64(collections),
        fileToB64(invoices),
        inventory ? fileToB64(inventory) : Promise.resolve(undefined),
      ]);
      const res = await parseAndImportReport({
        data: {
          collectionsB64: c,
          invoicesB64: i,
          inventoryB64: inv,
          reportDate: date || undefined,
          isManual: true,
        },
      });
      toast.success(`تم استيراد تقرير ${res.reportDate}`);
      localStorage.setItem("last_manual_upload_date", res.reportDate);
      if (isMounted.current) {
        setCollections(null);
        setInvoices(null);
        setDate(new Date().toISOString().slice(0, 10));
        if (collectionsRef.current) collectionsRef.current.value = "";
        if (invoicesRef.current) invoicesRef.current.value = "";
        setInventory(null);
        if (inventoryRef.current) inventoryRef.current.value = "";
        onUploaded();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الاستيراد");
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }

  return (
    <div className="flex flex-col md:flex-row items-end gap-3 p-4 rounded-[24px] border-[3px] border-primary-light bg-cream shadow-sm">
      <div className="flex-1 min-w-0 space-y-1">
        <label className="text-xs font-bold text-primary-dark">
          ملف التحصيل (xlsm/xlsx)
        </label>
        <Input
          ref={collectionsRef}
          type="file"
          accept=".xlsm,.xlsx"
          onChange={(e) => setCollections(e.target.files?.[0] ?? null)}
          className="border-2 border-primary/20 bg-white"
        />
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <label className="text-xs font-bold text-primary-dark">
          فواتير اليوم (xlsx)
        </label>
        <Input
          ref={invoicesRef}
          type="file"
          accept=".xlsx"
          onChange={(e) => setInvoices(e.target.files?.[0] ?? null)}
          className="border-2 border-primary/20 bg-white"
        />
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <label className="text-xs font-bold text-primary-dark">
          المخازن (xlsx)
        </label>
        <Input
          ref={inventoryRef}
          type="file"
          accept=".xlsx"
          onChange={(e) => setInventory(e.target.files?.[0] ?? null)}
          className="border-2 border-primary/20 bg-white"
        />
      </div>
      <div className="w-full md:w-44 space-y-1">
        <label className="text-xs font-bold text-primary-dark">
          تاريخ التقرير (اختياري)
        </label>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border-2 border-primary/20 bg-white"
        />
      </div>
      <div className="flex gap-2 w-full md:w-auto">
        <Button
          onClick={handleForceSync}
          disabled={syncing || loading}
          variant="outline"
          className="flex-1 md:flex-none border-[3px] border-info text-info hover:bg-info/10 shadow-sm"
        >
          {syncing ? (
            <Loader2 className="h-4 w-4 animate-spin ml-2" />
          ) : (
            <CloudDownload className="h-4 w-4 ml-2" />
          )}
          درايف
        </Button>

        <Button
          onClick={handleUpload}
          disabled={loading || syncing}
          className="flex-1 md:flex-none"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin ml-2" />
          ) : (
            <Upload className="h-4 w-4 ml-2" />
          )}
          استيراد
        </Button>
      </div>
    </div>
  );
}
