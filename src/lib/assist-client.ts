import type { EngineMode } from "@/lib/engine";
import type { SavedPaper } from "@/lib/library";

export type AssistPayload = {
  mode: EngineMode;
  instruction: string;
  manuscript?: string;
  selection?: string;
  question?: string;
  citationStyle?: string;
  sources?: Array<{
    title: string;
    authors: string[];
    year: number | null;
    venue: string | null;
    doi: string | null;
    abstract: string | null;
  }>;
};

export const toSource = (paper: SavedPaper) => ({
  title: paper.title,
  authors: paper.authors ?? [],
  year: paper.year ?? null,
  venue: paper.venue ?? null,
  doi: paper.doi ?? null,
  abstract: paper.snippet ?? null,
});

/** POST to the streaming assistant route and emit text as it arrives. */
export async function streamAssist(
  payload: AssistPayload,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
) {
  const response = await fetch("/api/assist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    ...(signal ? { signal } : {}),
  });

  if (!response.ok || !response.body) {
    const detail = (await response.text().catch(() => "")).trim();
    throw new Error(detail || `The assistant request failed (${response.status}).`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (chunk) {
      full += chunk;
      onDelta(chunk);
    }
  }
  return full;
}
