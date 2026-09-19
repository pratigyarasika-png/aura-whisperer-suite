import { useEffect, useState } from "react";

import { storageKind } from "@/lib/idb";

export type SyncState = "idle" | "saving" | "saved" | "offline" | "error";

type Snapshot = { state: SyncState; at: number; detail?: string };

let snapshot: Snapshot = { state: "idle", at: 0 };
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Report storage progress from anywhere in the app. */
export function setSyncState(state: SyncState, detail?: string) {
  snapshot = { state, at: Date.now(), ...(detail ? { detail } : {}) };
  emit();
}

/** Wrap a local persistence call so the header reflects its progress. */
export async function trackSave<T>(run: () => Promise<T>): Promise<T> {
  setSyncState("saving");
  try {
    const value = await run();
    setSyncState("saved");
    return value;
  } catch (error) {
    setSyncState("error", error instanceof Error ? error.message : undefined);
    throw error;
  }
}

export function useSyncStatus() {
  const [local, setLocal] = useState<Snapshot>(snapshot);
  const [online, setOnline] = useState(true);
  const [kind, setKind] = useState<"indexeddb" | "localstorage">("localstorage");

  useEffect(() => {
    const listener = () => setLocal(snapshot);
    listeners.add(listener);
    setKind(storageKind());
    setOnline(window.navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const state: SyncState = local.state === "saving" ? "saving" : online ? local.state : "offline";
  const label =
    state === "saving"
      ? "Saving locally…"
      : state === "error"
        ? "Could not save on this device"
        : state === "offline"
          ? "Offline — saved on this device"
          : state === "saved"
            ? "Saved on this device"
            : kind === "indexeddb"
              ? "Local storage ready"
              : "Local storage (basic)";

  return { state, label, online, storage: kind, detail: local.detail };
}
