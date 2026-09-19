export type EngineMode = "flash" | "pro" | "expert" | "deep" | "journal";

export const ENGINE_KEY = "orbis-engine";
export const ENGINE_EVENT = "orbis-engine-change";

export const engineLabels: Record<EngineMode, string> = {
  flash: "Gemini Flash",
  pro: "Gemini Pro",
  expert: "Gemini Expert",
  deep: "Deep Research",
  journal: "Journal Focus",
};

export const engineIds = Object.keys(engineLabels) as EngineMode[];

export function isEngineMode(value: unknown): value is EngineMode {
  return typeof value === "string" && (engineIds as string[]).includes(value);
}

export function loadEngine(): EngineMode {
  if (typeof window === "undefined") return "flash";
  const saved = window.localStorage.getItem(ENGINE_KEY);
  return isEngineMode(saved) ? saved : "flash";
}

export function saveEngine(mode: EngineMode) {
  window.localStorage.setItem(ENGINE_KEY, mode);
  window.dispatchEvent(new Event(ENGINE_EVENT));
}

export const writingPresets = [
  {
    id: "draft",
    label: "Write Draft",
    instruction:
      "Draft the next section of this manuscript in a formal academic register, continuing naturally from the existing text. Cite the supplied sources by author and year where they support a claim.",
  },
  {
    id: "literature",
    label: "Review Literature",
    instruction:
      "Write a literature review of the supplied sources: group them into themes, compare findings, and end with the evidence gaps that remain.",
  },
  {
    id: "systematic",
    label: "Systematic Review",
    instruction:
      "Produce a systematic-review style synthesis of the supplied sources: state inclusion criteria you inferred, tabulate study characteristics in prose, summarise outcomes, and note risk of bias and limitations.",
  },
  {
    id: "critique",
    label: "Review My Writing",
    instruction:
      "Critique the manuscript as a journal reviewer: structure, argument, clarity, methodology, citation use, and specific actionable revisions. Do not rewrite the whole text.",
  },
  {
    id: "report",
    label: "Write a Report",
    instruction:
      "Write a structured academic report from the manuscript and sources, with an abstract, introduction, findings, discussion, and conclusion.",
  },
] as const;

export const assistActions = [
  { id: "summarize-papers", label: "Summarize papers" },
  { id: "literature-review", label: "Draft literature review" },
  { id: "paraphrase", label: "Paraphrase manuscript" },
  { id: "verify-claims", label: "Verify claims" },
] as const;

export const inlineActions = [
  { id: "rephrase", label: "Rephrase" },
  { id: "summarize", label: "Summarize" },
  { id: "polish", label: "Academic Polish" },
  { id: "grammar", label: "Fix Grammar" },
] as const;
