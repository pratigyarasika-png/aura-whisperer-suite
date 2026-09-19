import type { Dataset } from "@/lib/dataset";
import { idbAll, idbDelete, idbGet, idbPut } from "@/lib/idb";

export type AnalysisProject = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  datasets: Dataset[];
  activeId: string | null;
  code: string;
  narrative: string;
  tab: string;
  /** Saved chart/transform configuration, free-form so panels can evolve. */
  charts?: unknown;
  transforms?: unknown;
};

export type ProjectSummary = {
  id: string;
  name: string;
  updatedAt: number;
  datasetCount: number;
  rowCount: number;
};

export const newProjectId = () =>
  `proj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export async function saveProject(project: AnalysisProject) {
  await idbPut("projects", { ...project, updatedAt: Date.now() });
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const rows = await idbAll<AnalysisProject>("projects");
  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      updatedAt: row.updatedAt,
      datasetCount: row.datasets?.length ?? 0,
      rowCount: (row.datasets ?? []).reduce((total, set) => total + (set.rows?.length ?? 0), 0),
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function openProject(id: string) {
  return idbGet<AnalysisProject>("projects", id);
}

export async function deleteProject(id: string) {
  await idbDelete("projects", id);
}
