import { get, set, keys, del } from "idb-keyval";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";

const DB_PREFIX = "report_";
const FIRESTORE_COLLECTION = "reports";

/**
 * Fast, instant local-first loading.
 * If reports exist in IndexedDB, they are returned immediately without network lag.
 * If IndexedDB is empty (e.g. brand new browser/device), it falls back to Firestore.
 */
export async function getLocalReports() {
  const reportsMap = new Map<string, any>();

  // 1. Load from local IndexedDB first (lightning fast, zero network latency)
  if (typeof window !== "undefined") {
    try {
      const allKeys = await keys();
      const reportKeys = allKeys.filter(
        (k) => typeof k === "string" && k.startsWith(DB_PREFIX),
      );

      for (const key of reportKeys) {
        // Clean up invalid or corrupted dummy keys from previous tests
        if (key === DB_PREFIX + "latest" || key === DB_PREFIX + "rep_20261107") {
          await del(key);
          continue;
        }
        const data = await get(key);
        if (data && data.report && data.report.report_date) {
          const id = data.report.id || String(key).replace(DB_PREFIX, "");
          data.report.id = id;
          reportsMap.set(id, data);
        }
      }
    } catch (error) {
      console.error("Error fetching from IndexedDB", error);
    }
  }

  // 2. Fetch static bundled reports if IndexedDB is empty or has very few reports (<10)
  if (reportsMap.size < 10 && typeof window !== "undefined") {
    try {
      const basePath = window.location.pathname.includes("/sales-report")
        ? "/sales-report/"
        : "./";
      const res = await fetch(basePath + "sales_data.json?t=" + Date.now(), {
        cache: "no-store",
      });
      if (res.ok) {
        const staticData = await res.json();
        if (Array.isArray(staticData)) {
          for (const item of staticData) {
            if (item && item.report && item.report.report_date) {
              const id = item.report.id || item.report.report_date;
              item.report.id = id;
              reportsMap.set(id, item);
              set(DB_PREFIX + id, item).catch(() => {});
            }
          }
        } else if (staticData && staticData.report && staticData.report.report_date) {
          const id = staticData.report.id || "latest";
          if (id !== "latest" && id !== "rep_20261107") {
            staticData.report.id = id;
            reportsMap.set(id, staticData);
            set(DB_PREFIX + id, staticData).catch(() => {});
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }

  // 3. Live sync with cloud Firestore
  try {
    const snap = await getDocs(collection(db, FIRESTORE_COLLECTION));
    if (!snap.empty) {
      for (const docSnap of snap.docs) {
        const data = docSnap.data();
        if (data && data.report && data.report.report_date) {
          const id = data.report.id || docSnap.id;
          data.report.id = id;
          reportsMap.set(id, data);
          if (typeof window !== "undefined") {
            set(DB_PREFIX + id, data).catch(() => {});
          }
        }
      }
    }
  } catch (error: any) {
    console.warn("Firestore sync warning:", error);
  }

  const reports = Array.from(reportsMap.values());
  reports.sort(
    (a, b) =>
      new Date(b.report.report_date).getTime() -
      new Date(a.report.report_date).getTime(),
  );

  return reports;
}

export async function getLocalReport(id: string) {
  // 1. Try IndexedDB first (instant)
  if (typeof window !== "undefined") {
    try {
      const data = await get(DB_PREFIX + id);
      if (data) return data;
    } catch (error) {
      console.error("Error fetching from IndexedDB", error);
    }
  }

  // 2. Try Firestore fallback
  try {
    const docSnap = await getDoc(doc(db, FIRESTORE_COLLECTION, id));
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (!data.report.id) data.report.id = docSnap.id;
      if (typeof window !== "undefined") {
        set(DB_PREFIX + id, data).catch(() => {});
      }
      return data;
    }
  } catch (error: any) {
    console.warn("Firestore getDoc failed:", error);
  }

  // 3. Fallback to sales_data.json
  if (typeof window !== "undefined") {
    try {
      const basePath = window.location.pathname.includes("/sales-report")
        ? "/sales-report/"
        : "./";
      const res = await fetch(basePath + "sales_data.json?t=" + Date.now(), {
        cache: "no-store",
      });
      if (res.ok) {
        const staticData = await res.json();
        if (staticData && staticData.report) {
          return staticData;
        }
      }
    } catch (e) {
      // ignore
    }
  }

  return undefined;
}

/**
 * Instant save: Saves to IndexedDB immediately (<10ms) and syncs to Firestore
 * in the background asynchronously so the UI never freezes or stutters.
 */
export async function saveLocalReport(reportData: any) {
  const id = reportData.report.id || crypto.randomUUID();
  reportData.report.id = id;

  // 1. Save to local IndexedDB immediately (instant)
  if (typeof window !== "undefined") {
    try {
      await set(DB_PREFIX + id, reportData);
    } catch (error) {
      console.error("Failed to save to IndexedDB", error);
    }
  }

  // 2. Sync to cloud Firestore
  try {
    await setDoc(doc(db, FIRESTORE_COLLECTION, id), reportData);
  } catch (err) {
    console.warn("Firestore save warning:", err);
  }

  return id;
}

export async function deleteLocalReport(id: string) {
  // 1. Delete from IndexedDB immediately
  if (typeof window !== "undefined") {
    try {
      await del(DB_PREFIX + id);
    } catch (error) {
      console.error("Failed to delete from IndexedDB", error);
    }
  }

  // 2. Delete from Firestore
  try {
    await deleteDoc(doc(db, FIRESTORE_COLLECTION, id));
  } catch (err) {
    console.warn("Firestore delete warning:", err);
  }
}

export async function resetLocalDb() {
  // 1. Reset IndexedDB
  if (typeof window !== "undefined") {
    try {
      const allKeys = await keys();
      const reportKeys = allKeys.filter(
        (k) => typeof k === "string" && k.startsWith(DB_PREFIX),
      );
      for (const key of reportKeys) {
        await del(key);
      }
    } catch (error) {
      console.error("Failed to clear IndexedDB", error);
    }
  }

  // 2. Reset Firestore
  try {
    const snap = await getDocs(collection(db, FIRESTORE_COLLECTION));
    for (const d of snap.docs) {
      deleteDoc(d.ref).catch(() => {});
    }
  } catch (error: any) {
    console.error("Failed to clear Firestore", error);
  }
}

export async function saveAiSummaryLocally(reportId: string, summary: any) {
  // 1. Update IndexedDB immediately
  if (typeof window !== "undefined") {
    try {
      const data = await get(DB_PREFIX + reportId);
      if (data) {
        data.report.ai_summary = summary;
        await set(DB_PREFIX + reportId, data);
      }
    } catch (error) {
      console.error("Failed to save AI summary to IndexedDB", error);
    }
  }

  // 2. Update Firestore in background
  updateDoc(doc(db, FIRESTORE_COLLECTION, reportId), {
    "report.ai_summary": summary,
  }).catch((err) => {
    console.warn("Background Firestore AI summary update warning:", err);
  });
}
