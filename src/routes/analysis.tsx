import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Database,
  FileSpreadsheet,
  FileUp,
  Loader2,
  Play,
  Sparkles,
  Table2,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ChartsPanel } from "@/components/analysis/ChartsPanel";
import { CodeEditor } from "@/components/analysis/CodeEditor";
import { DataGridPanel } from "@/components/analysis/DataGridPanel";
import { Button } from "@/components/ui/button";
import {
  datasetFromMatrix,
  datasetSummaryForAi,
  datasetToCsv,
  describe,
  downloadText,
  numericColumns,
  parseCsvFile,
  parsePdfFile,
  parseXlsxFile,
  type Dataset,
} from "@/lib/dataset";
import { PY_TEMPLATES } from "@/lib/py-templates";
import { runPython, type PythonResult } from "@/lib/pyodide-client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/analysis")({
  head: () => ({
    meta: [
      { title: "Data & Coding — Orbis Analysis Workspace" },
      {
        name: "description",
        content:
          "Upload CSV, Excel and PDF data, clean it, run Python statistics in the browser, and generate charts with AI narratives.",
      },
      { property: "og:title", content: "Data & Coding — Orbis Analysis Workspace" },
      {
        property: "og:description",
        content: "Python statistics sandbox, dataset cleaning, auto-charts and AI statistical narratives.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AnalysisWorkspace,
});

const STORE_KEY = "orbis-analysis-session-v1";

type Tab = "data" | "code" | "charts" | "insights";

const TABS: { id: Tab; label: string }[] = [
  { id: "data", label: "Data" },
  { id: "code", label: "Code" },
  { id: "charts", label: "Charts" },
  { id: "insights", label: "Insights" },
];

type Session = {
  datasets: Dataset[];
  activeId: string | null;
  code: string;
  narrative: string;
  tab: Tab;
};

const EMPTY: Session = {
  datasets: [],
  activeId: null,
  code: PY_TEMPLATES[0]?.build({ numeric: [], categorical: [] }) ?? "",
  narrative: "",
  tab: "data",
};

function loadSession(): Session {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Session>;
    return {
      datasets: Array.isArray(parsed.datasets) ? parsed.datasets : [],
      activeId: parsed.activeId ?? null,
      code: typeof parsed.code === "string" ? parsed.code : EMPTY.code,
      narrative: typeof parsed.narrative === "string" ? parsed.narrative : "",
      tab: (["data", "code", "charts", "insights"] as Tab[]).includes(parsed.tab as Tab)
        ? (parsed.tab as Tab)
        : "data",
    };
  } catch {
    return EMPTY;
  }
}

function AnalysisWorkspace() {
  const [session, setSession] = useState<Session>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PythonResult | null>(null);
  const [progress, setProgress] = useState("");
  const [url, setUrl] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [pdfText, setPdfText] = useState<{ name: string; text: string; figures: string[] } | null>(null);
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSession(loadSession());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(session));
    } catch {
      /* storage full or blocked — session stays in memory */
    }
  }, [session, hydrated]);

  const patch = useCallback((next: Partial<Session>) => {
    setSession((current) => ({ ...current, ...next }));
  }, []);

  const active = useMemo(
    () => session.datasets.find((d) => d.id === session.activeId) ?? session.datasets[0] ?? null,
    [session.datasets, session.activeId],
  );

  const columnGroups = useMemo(() => {
    if (!active) return { numeric: [], categorical: [] };
    const numeric = numericColumns(active);
    return {
      numeric,
      categorical: active.columns.filter((c) => c.type !== "number").map((c) => c.name),
    };
  }, [active]);

  const addDatasets = (incoming: Dataset[]) => {
    if (!incoming.length) return;
    setSession((current) => ({
      ...current,
      datasets: [...incoming, ...current.datasets].slice(0, 12),
      activeId: incoming[0]?.id ?? current.activeId,
      tab: "data",
    }));
  };

  const handleFiles = async (files: FileList | File[]) => {
    setError(null);
    setBusy("Reading files…");
    try {
      for (const file of Array.from(files)) {
        const name = file.name.toLowerCase();
        if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt")) {
          addDatasets([await parseCsvFile(file)]);
        } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
          addDatasets(await parseXlsxFile(file));
        } else if (name.endsWith(".pdf")) {
          const extraction = await parsePdfFile(file);
          setPdfText({ name: file.name, text: extraction.text, figures: extraction.figures });
          addDatasets(extraction.tables);
        } else {
          setError(`${file.name} is not a CSV, Excel or PDF file.`);
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read that file.");
    } finally {
      setBusy(null);
    }
  };

  const scrape = async () => {
    if (!url.trim()) return;
    setError(null);
    setBusy("Scraping tables…");
    try {
      const response = await fetch("/api/scrape-table", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      if (!response.ok) throw new Error((await response.text()) || "Scrape failed.");
      const data = (await response.json()) as {
        title: string;
        tables: { caption: string; matrix: string[][] }[];
      };
      if (!data.tables.length) throw new Error("No HTML tables were found on that page.");
      addDatasets(
        data.tables.map((table, i) =>
          datasetFromMatrix(
            table.matrix,
            `${table.caption || data.title || "Scraped"} — table ${i + 1}`.slice(0, 80),
            "Web scrape",
          ),
        ),
      );
      setUrl("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Scrape failed.");
    } finally {
      setBusy(null);
    }
  };

  const execute = async () => {
    setError(null);
    setBusy("Running Python…");
    setProgress("Starting the Python runtime…");
    try {
      const output = await runPython(session.code, active, setProgress);
      setResult(output);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Python could not start.");
    } finally {
      setBusy(null);
      setProgress("");
    }
  };

  const callAi = async (mode: "code" | "narrative") => {
    if (!active) return;
    setError(null);
    setBusy(mode === "code" ? "Writing Python…" : "Writing the narrative…");
    if (mode === "narrative") patch({ narrative: "" });
    try {
      const response = await fetch("/api/data-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          request: aiPrompt.trim(),
          dataset: datasetSummaryForAi(active),
        }),
      });
      if (!response.ok) throw new Error((await response.text()) || "The AI request failed.");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Empty AI response.");
      const decoder = new TextDecoder();
      let text = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        const clean = mode === "code" ? text.replace(/^```(?:python)?\n?|```$/g, "") : text;
        if (mode === "code") patch({ code: clean, tab: "code" });
        else patch({ narrative: clean, tab: "insights" });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The AI request failed.");
    } finally {
      setBusy(null);
    }
  };

  const stats = active ? describe(active) : [];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Button asChild variant="ghost" size="sm" className="h-9 rounded-full px-3 text-xs">
            <Link to="/">
              <ArrowLeft className="mr-1 size-4" /> Orbis
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 truncate text-sm font-semibold">
              <Database className="size-4 text-primary" /> Data &amp; Coding
            </h1>
            <p className="truncate text-[11px] text-muted-foreground">
              {active ? `${active.name} · ${active.rows.length.toLocaleString()} rows` : "No dataset loaded yet"}
            </p>
          </div>
          <nav className="ml-auto flex flex-wrap gap-1" aria-label="Workspace sections">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => patch({ tab: tab.id })}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                  session.tab === tab.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        {(busy || error) && (
          <div
            className={cn(
              "rounded-2xl border px-4 py-3 text-xs",
              error ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border bg-card",
            )}
          >
            {error ?? (
              <span className="flex items-center gap-2">
                <Loader2 className="size-3.5 animate-spin" /> {progress || busy}
              </span>
            )}
          </div>
        )}

        {session.datasets.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {session.datasets.map((dataset) => (
              <span
                key={dataset.id}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px]",
                  dataset.id === active?.id ? "border-primary bg-accent" : "border-border",
                )}
              >
                <button onClick={() => patch({ activeId: dataset.id })} className="max-w-52 truncate font-medium">
                  {dataset.name}
                </button>
                <button
                  aria-label={`Remove ${dataset.name}`}
                  onClick={() =>
                    setSession((current) => {
                      const datasets = current.datasets.filter((d) => d.id !== dataset.id);
                      return {
                        ...current,
                        datasets,
                        activeId: current.activeId === dataset.id ? (datasets[0]?.id ?? null) : current.activeId,
                      };
                    })
                  }
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {session.tab === "data" && (
          <section className="space-y-5">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setOver(true);
                }}
                onDragLeave={() => setOver(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setOver(false);
                  if (event.dataTransfer.files?.length) void handleFiles(event.dataTransfer.files);
                }}
                onClick={() => fileRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => event.key === "Enter" && fileRef.current?.click()}
                className={cn(
                  "grid cursor-pointer place-items-center rounded-3xl border-2 border-dashed px-4 py-10 text-center transition-colors",
                  over ? "border-primary bg-accent" : "border-border hover:border-primary/50 hover:bg-muted/40",
                )}
              >
                <FileUp className="size-5 text-muted-foreground" />
                <p className="mt-2 text-sm font-semibold">Drop CSV, Excel or PDF files</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Tables, text and figures are extracted automatically
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept=".csv,.tsv,.txt,.xlsx,.xls,.pdf"
                  className="hidden"
                  aria-label="Upload data files"
                  onChange={(event) => {
                    if (event.target.files?.length) void handleFiles(event.target.files);
                    event.target.value = "";
                  }}
                />
              </div>

              <div className="rounded-3xl border border-border bg-card p-4">
                <p className="flex items-center gap-2 text-[11px] font-semibold uppercase text-muted-foreground">
                  <Table2 className="size-3.5" /> Web table scraper
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Paste a journal or statistics page and Orbis pulls every HTML table into a dataset.
                </p>
                <div className="mt-3 flex gap-2">
                  <input
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && void scrape()}
                    placeholder="https://example.org/article"
                    aria-label="Page URL to scrape"
                    className="h-9 min-w-0 flex-1 rounded-full border border-input bg-background px-3 text-xs outline-none"
                  />
                  <Button size="sm" className="h-9 rounded-full text-xs" onClick={() => void scrape()} disabled={!url.trim() || !!busy}>
                    Scrape
                  </Button>
                </div>

                {active && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8 rounded-full text-[11px]"
                      onClick={() => downloadText(`${active.name}.csv`, datasetToCsv(active), "text/csv")}
                    >
                      <FileSpreadsheet className="mr-1 size-3.5" /> Export CSV
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8 rounded-full text-[11px]"
                      onClick={() =>
                        downloadText(`${active.name}.json`, JSON.stringify(active.rows, null, 2), "application/json")
                      }
                    >
                      Export JSON
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {active ? (
              <DataGridPanel
                dataset={active}
                onChange={(next) =>
                  setSession((current) => ({
                    ...current,
                    datasets: current.datasets.map((d) => (d.id === next.id ? next : d)),
                  }))
                }
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                Upload a file or scrape a page to see the interactive data grid.
              </p>
            )}

            {pdfText && (
              <div className="rounded-3xl border border-border bg-card p-4">
                <p className="text-[11px] font-semibold uppercase text-muted-foreground">
                  Text extracted from {pdfText.name}
                </p>
                <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-[11px] leading-5">
                  {pdfText.text.slice(0, 6000)}
                </pre>
                {pdfText.figures.length > 0 && (
                  <div className="mt-3 flex gap-2 overflow-x-auto">
                    {pdfText.figures.map((figure, i) => (
                      <img key={i} src={figure} alt={`Page ${i + 1} of ${pdfText.name}`} className="h-40 rounded-xl border border-border" />
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {session.tab === "code" && (
          <section className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {PY_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  title={template.description}
                  onClick={() => patch({ code: template.build(columnGroups) })}
                  className="rounded-full border border-border px-3 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {template.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                value={aiPrompt}
                onChange={(event) => setAiPrompt(event.target.value)}
                placeholder="Ask the AI for a script — e.g. compare scores across groups"
                aria-label="AI code request"
                className="h-9 min-w-0 flex-1 rounded-full border border-input bg-background px-3 text-xs outline-none"
              />
              <Button
                size="sm"
                variant="secondary"
                className="h-9 rounded-full text-xs"
                disabled={!active || !!busy}
                onClick={() => void callAi("code")}
              >
                <WandSparkles className="mr-1 size-3.5" /> Generate script
              </Button>
              <Button size="sm" className="h-9 rounded-full text-xs" onClick={() => void execute()} disabled={!!busy}>
                <Play className="mr-1 size-3.5" /> Run
              </Button>
            </div>

            <CodeEditor value={session.code} onChange={(code) => patch({ code })} />

            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-[11px] font-semibold uppercase text-muted-foreground">Execution console</p>
              {!result && !busy && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Run the script to see printed output, errors and figures. Your dataset is available as{" "}
                  <code className="rounded bg-muted px-1">df</code>.
                </p>
              )}
              {result && (
                <>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Finished in {(result.durationMs / 1000).toFixed(2)}s
                  </p>
                  {result.stdout && (
                    <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-muted/50 p-3 font-mono text-[11px] leading-5">
                      {result.stdout}
                    </pre>
                  )}
                  {(result.stderr || result.error) && (
                    <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl border border-destructive/40 bg-destructive/10 p-3 font-mono text-[11px] leading-5 text-destructive">
                      {result.error ?? result.stderr}
                    </pre>
                  )}
                  {result.figures.length > 0 && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {result.figures.map((figure, i) => (
                        <img key={i} src={figure} alt={`Figure ${i + 1}`} className="rounded-xl border border-border bg-white" />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        )}

        {session.tab === "charts" && (
          <section className="space-y-4">
            {active ? (
              <ChartsPanel dataset={active} />
            ) : (
              <p className="text-xs text-muted-foreground">Load a dataset first to generate charts.</p>
            )}
          </section>
        )}

        {session.tab === "insights" && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                className="h-9 rounded-full text-xs"
                disabled={!active || !!busy}
                onClick={() => void callAi("narrative")}
              >
                <Sparkles className="mr-1 size-3.5" /> Generate statistical narrative
              </Button>
              {!active && <span className="text-xs text-muted-foreground">Load a dataset first.</span>}
            </div>

            {stats.length > 0 && (
              <div className="overflow-auto rounded-2xl border border-border">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="bg-muted">
                    <tr>
                      {["Column", "n", "Missing", "Mean", "Median", "SD", "Min", "Max"].map((h) => (
                        <th key={h} className="border-b border-border px-3 py-2 font-semibold">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map((row) => (
                      <tr key={row.column} className="odd:bg-muted/30">
                        <td className="border-b border-border px-3 py-1.5 font-medium">{row.column}</td>
                        <td className="border-b border-border px-3 py-1.5">{row.count}</td>
                        <td className="border-b border-border px-3 py-1.5">{row.missing}</td>
                        <td className="border-b border-border px-3 py-1.5">{row.mean.toFixed(3)}</td>
                        <td className="border-b border-border px-3 py-1.5">{row.median.toFixed(3)}</td>
                        <td className="border-b border-border px-3 py-1.5">{row.std.toFixed(3)}</td>
                        <td className="border-b border-border px-3 py-1.5">{row.min.toFixed(3)}</td>
                        <td className="border-b border-border px-3 py-1.5">{row.max.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="rounded-3xl border border-border bg-card p-4">
              <p className="text-[11px] font-semibold uppercase text-muted-foreground">AI statistical narrative</p>
              {session.narrative ? (
                <div className="mt-2 whitespace-pre-wrap text-xs leading-6">{session.narrative}</div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  Generate an executive summary interpreting trends, correlations and anomalies in the active dataset.
                </p>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
