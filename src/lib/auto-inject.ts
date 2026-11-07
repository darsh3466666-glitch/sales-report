import { getLocalReports } from "./local-db";
import { parseAndImportReport } from "./excel-parser.functions";
import { fetchDriveFiles } from "./drive.functions";

/** Fetch Excel files from Google Drive and inject into IndexedDB if not manually uploaded today */
export async function autoInjectFromDrive(): Promise<{
  injected: boolean;
  reportId?: string;
}> {
  try {
    const today = new Date().toISOString().slice(0, 10);

    // Check if we already have a report for today
    const existing = await getLocalReports();
    const existingSameDate = existing.find(
      (r: any) => r.report?.report_date === today,
    );

    // Also check if we already attempted and failed today to prevent quota spam
    const lastAttempt = localStorage.getItem("last_auto_inject_attempt");
    if (lastAttempt === today && !existingSameDate) {
      console.log(
        `[auto-inject] Already attempted auto-inject today (${today}) and it failed. Skipping to avoid quota errors.`,
      );
      return { injected: false };
    }

    // If we already have a report for today, skip auto-inject to prevent infinite write loops and conserve quota.
    // The user can still trigger a manual sync using the Google Drive sync button.
    if (existingSameDate) {
      console.log(
        `[auto-inject] Report for today (${today}) already exists. Skipping auto-inject.`,
      );
      return { injected: false, reportId: existingSameDate.report.id };
    }

    localStorage.setItem("last_auto_inject_attempt", today);

    console.log("[auto-inject] Fetching files from Google Drive...");
    const files = await fetchDriveFiles();

    console.log("[auto-inject] Parsing and importing...");
    const res = await parseAndImportReport({
      data: {
        collectionsB64: files.collectionsB64,
        invoicesB64: files.invoicesB64,
        inventoryB64: files.inventoryB64,
        reportDate: today,
      },
    });

    console.log("[auto-inject] Injected Drive data:", res.reportId);
    return { injected: true, reportId: res.reportId };
  } catch (e) {
    console.error("[auto-inject] Failed:", e);
    return { injected: false };
  }
}

export async function forceInjectFromDrive(): Promise<{
  injected: boolean;
  reportId?: string;
}> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    console.log("[auto-inject] Fetching files from Google Drive (FORCE)...");
    const files = await fetchDriveFiles();

    console.log("[auto-inject] Parsing and importing...");
    const res = await parseAndImportReport({
      data: {
        collectionsB64: files.collectionsB64,
        invoicesB64: files.invoicesB64,
        inventoryB64: files.inventoryB64,
        reportDate: today,
      },
    });

    console.log("[auto-inject] Force Injected Drive data:", res.reportId);

    // Clear manual upload flag so this doesn't get skipped next time if it was manually uploaded
    localStorage.removeItem("last_manual_upload_date");
    localStorage.removeItem("last_auto_inject_attempt");

    return { injected: true, reportId: res.reportId };
  } catch (e: any) {
    console.error("[auto-inject] Failed (FORCE):", e);
    throw e;
  }
}
