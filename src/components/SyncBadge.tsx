import { Check, CloudOff, HardDrive, Loader2, TriangleAlert } from "lucide-react";

import { useSyncStatus } from "@/lib/sync-status";
import { cn } from "@/lib/utils";

/** Live storage indicator: saving, saved on device, or offline. */
export function SyncBadge({ className }: { className?: string }) {
  const { state, label, detail } = useSyncStatus();

  const Icon =
    state === "saving"
      ? Loader2
      : state === "offline"
        ? CloudOff
        : state === "error"
          ? TriangleAlert
          : state === "saved"
            ? Check
            : HardDrive;

  return (
    <span
      title={detail ?? label}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium",
        state === "error" ? "border-destructive/40 text-destructive" : "text-muted-foreground",
        className,
      )}
    >
      <Icon className={cn("size-3.5", state === "saving" && "animate-spin")} />
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}
