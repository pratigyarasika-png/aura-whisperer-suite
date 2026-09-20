import { Clock, FolderOpen, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  deleteProject,
  listProjects,
  openProject,
  saveProject,
  type AnalysisProject,
  type ProjectSummary,
} from "@/lib/projects";
import { trackSave } from "@/lib/sync-status";

type Props = {
  /** Current workspace state to store when the user saves. */
  buildSnapshot: () => Omit<AnalysisProject, "createdAt" | "updatedAt">;
  /** Restore a saved project into the workspace. */
  onOpen: (project: AnalysisProject) => void;
};

const when = (time: number) => new Date(time).toLocaleString();

/** Save the analysis workspace on this device and reopen it from history. */
export function ProjectHistory({ buildSnapshot, onOpen }: Props) {
  const [items, setItems] = useState<ProjectSummary[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setItems(await listProjects());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read saved projects.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const snapshot = buildSnapshot();
      await trackSave(() =>
        saveProject({ ...snapshot, name: name.trim() || snapshot.name, createdAt: Date.now(), updatedAt: Date.now() }),
      );
      setName("");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this project.");
    } finally {
      setBusy(false);
    }
  };

  const open = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const project = await openProject(id);
      if (!project) throw new Error("That project is no longer stored on this device.");
      onOpen(project);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open that project.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    await deleteProject(id);
    await refresh();
  };

  return (
    <section className="rounded-3xl border border-border bg-card p-4">
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase text-muted-foreground">
        <Clock className="size-3.5" /> Project history
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Datasets, cleaning steps, code, charts and narratives are stored on this device.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && void save()}
          placeholder="Project name"
          aria-label="Project name"
          className="h-9 min-w-0 flex-1 rounded-full border border-input bg-background px-3 text-xs outline-none"
        />
        <Button size="sm" className="h-9 rounded-full text-xs" disabled={busy} onClick={() => void save()}>
          <Save className="mr-1 size-3.5" /> Save project
        </Button>
      </div>

      {error && <p className="mt-2 text-[11px] text-destructive">{error}</p>}

      <ul className="mt-4 space-y-2">
        {items.length === 0 && (
          <li className="text-xs text-muted-foreground">No saved projects yet.</li>
        )}
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center gap-2 rounded-2xl border border-border px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{item.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {item.datasetCount} dataset{item.datasetCount === 1 ? "" : "s"} ·{" "}
                {item.rowCount.toLocaleString()} rows · {when(item.updatedAt)}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="h-8 rounded-full text-[11px]"
              disabled={busy}
              onClick={() => void open(item.id)}
            >
              <FolderOpen className="mr-1 size-3.5" /> Open
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-8 rounded-full"
              aria-label={`Delete ${item.name}`}
              onClick={() => void remove(item.id)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
