import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft, BarChart3, BrainCircuit, Download, FileSpreadsheet, FlaskConical,
  LineChart as LineChartIcon, Loader2, Save, ScatterChart as ScatterIcon, Sparkles, Trash2, Upload,
} from "lucide-react";
import Papa from "papaparse";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Scatter, ScatterChart,
  Tooltip, XAxis, YAxis, ZAxis,
} from "recharts";
import * as XLSX from "xlsx";

import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  correlation, datasetSummary, formatNumber, histogram, normalizeRows, numericValues,
  profileData, regression, runTTest, type DataRow,
} from "@/lib/data-analysis";
import { interpretDataset } from "@/lib/data-insights.functions";

export const Route = createFileRoute("/analyze")({
  head: () => ({ meta: [
    { title: "Data Analysis Suite — Orbis" },
    { name: "description", content: "Analyze CSV and Excel datasets with charts, statistics, regression, and AI interpretation." },
    { property: "og:title", content: "Data Analysis Suite — Orbis" },
    { property: "og:description", content: "Explore datasets with statistical tests, visualizations, and careful AI interpretation." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: DataAnalysisSuite,
});

type ChartType = "bar" | "line" | "scatter" | "histogram" | "correlation";
type SavedDataset = { id: string; name: string; savedAt: string; rows: DataRow[] };
const STORAGE_KEY = "orbis-data-analysis-sessions";
const chartConfig = { value: { label: "Value", color: "var(--color-primary)" }, count: { label: "Count", color: "var(--color-signal)" } } satisfies ChartConfig;
const sampleRows: DataRow[] = [
  { cohort: "Control", hours: 2, score: 61, confidence: 3.1 }, { cohort: "Control", hours: 3, score: 65, confidence: 3.4 },
  { cohort: "Control", hours: 4, score: 68, confidence: 3.7 }, { cohort: "Treatment", hours: 4, score: 74, confidence: 4.1 },
  { cohort: "Treatment", hours: 5, score: 79, confidence: 4.4 }, { cohort: "Treatment", hours: 6, score: 85, confidence: 4.8 },
  { cohort: "Treatment", hours: 7, score: 89, confidence: null }, { cohort: "Control", hours: 5, score: 72, confidence: 3.9 },
];

function DataAnalysisSuite() {
  const getInsights = useServerFn(interpretDataset);
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("Learning outcomes sample");
  const [rows, setRows] = useState<DataRow[]>(sampleRows);
  const [sheets, setSheets] = useState<Record<string, DataRow[]>>({});
  const [sheet, setSheet] = useState("");
  const [saved, setSaved] = useState<SavedDataset[]>([]);
  const [chartType, setChartType] = useState<ChartType>("scatter");
  const [xColumn, setXColumn] = useState("hours");
  const [yColumn, setYColumn] = useState("score");
  const [groupColumn, setGroupColumn] = useState("cohort");
  const [expected, setExpected] = useState("0");
  const [question, setQuestion] = useState("");
  const [insights, setInsights] = useState("");
  const [insightsError, setInsightsError] = useState("");
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState("");

  const profiles = useMemo(() => profileData(rows), [rows]);
  const columns = profiles.map((profile) => profile.name);
  const numericColumns = profiles.filter((profile) => profile.type === "numeric").map((profile) => profile.name);
  const textColumns = profiles.filter((profile) => profile.type === "text").map((profile) => profile.name);
  const correlationValue = xColumn && yColumn ? correlation(rows, xColumn, yColumn) : null;
  const regressionValue = xColumn && yColumn ? regression(rows, xColumn, yColumn) : null;
  const test = yColumn ? runTTest(rows, yColumn, groupColumn, Number(expected) || 0) : null;

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as SavedDataset[];
      setSaved(Array.isArray(stored) ? stored : []);
    } catch { setSaved([]); }
  }, []);

  useEffect(() => {
    if (!numericColumns.includes(xColumn)) setXColumn(numericColumns[0] ?? "");
    if (!numericColumns.includes(yColumn)) setYColumn(numericColumns[1] ?? numericColumns[0] ?? "");
    if (!columns.includes(groupColumn)) setGroupColumn(textColumns[0] ?? "");
  }, [columns.join("|"), numericColumns.join("|"), textColumns.join("|")]);

  const readFile = async (file: File) => {
    setFileError(""); setInsights("");
    if (file.size > 20 * 1024 * 1024) { setFileError("Files must be under 20 MB."); return; }
    try {
      if (/\.csv$/i.test(file.name)) {
        const parsed = Papa.parse<unknown[]>(await file.text(), { skipEmptyLines: true });
        if (parsed.errors.length) throw new Error(parsed.errors[0]?.message ?? "Could not read CSV.");
        const next = normalizeRows(parsed.data);
        if (!next.length) throw new Error("No data rows were found.");
        setRows(next); setSheets({}); setSheet("");
      } else {
        const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
        const nextSheets = Object.fromEntries(workbook.SheetNames.map((sheetName) => {
          const worksheet = workbook.Sheets[sheetName];
          return [sheetName, worksheet ? normalizeRows(XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: true })) : []];
        }));
        const first = workbook.SheetNames[0];
        if (!first || !nextSheets[first]?.length) throw new Error("No data rows were found.");
        setSheets(nextSheets); setSheet(first); setRows(nextSheets[first]);
      }
      setName(file.name.replace(/\.(csv|xlsx?|xls)$/i, ""));
    } catch (error) { setFileError(error instanceof Error ? error.message : "This file could not be read."); }
  };

  const saveDataset = () => {
    const entry: SavedDataset = { id: crypto.randomUUID(), name, savedAt: new Date().toISOString(), rows: rows.slice(0, 500) };
    const next = [entry, ...saved.filter((item) => item.name !== name)].slice(0, 3);
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setSaved(next); }
    catch { setFileError("This dataset is too large to save on this device. Analysis remains available in this visit."); }
  };

  const exportCsv = () => {
    const csv = Papa.unparse(rows);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `${name || "dataset"}-analysis.csv`; link.click(); URL.revokeObjectURL(url);
  };

  const requestInsights = async () => {
    setBusy(true); setInsights(""); setInsightsError("");
    try {
      const payload = { ...datasetSummary(rows, profiles), correlation: correlationValue, regression: regressionValue, tTest: test };
      const result = await getInsights({ data: { datasetName: name, question, summary: JSON.stringify(payload) } });
      setInsights(result.text);
    } catch (error) { setInsightsError(error instanceof Error ? error.message : "AI interpretation failed."); }
    finally { setBusy(false); }
  };

  const plottedRows = rows.slice(0, 300).map((row, index) => ({ ...row, row: index + 1 }));
  const histogramRows = histogram(numericValues(rows, yColumn));
  const correlationRows = numericColumns.map((column) => ({ column, values: numericColumns.map((other) => correlation(rows, column, other)) }));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[96rem] items-center gap-3 px-4 sm:px-6">
          <Button asChild variant="ghost" size="icon"><Link to="/" aria-label="Back to research canvas"><ArrowLeft /></Link></Button>
          <span className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground"><BarChart3 className="size-4" /></span>
          <div className="min-w-0"><h1 className="font-display truncate text-lg font-semibold">Data Analysis Suite</h1><p className="hidden text-xs text-muted-foreground sm:block">Statistical exploration on this device</p></div>
          <div className="ml-auto flex gap-2"><Button variant="outline" size="sm" onClick={saveDataset}><Save /> Save</Button><Button variant="outline" size="sm" onClick={exportCsv}><Download /> Export</Button></div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[96rem] gap-5 px-4 py-6 sm:px-6 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="space-y-5 xl:sticky xl:top-20 xl:self-start">
          <section className="rounded-md border border-border bg-card p-4">
            <div className="flex items-center gap-2"><FileSpreadsheet className="size-4 text-primary" /><h2 className="text-sm font-semibold">Dataset</h2></div>
            <button type="button" onClick={() => fileRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void readFile(file); }} className="mt-3 grid w-full place-items-center rounded-md border-2 border-dashed border-border px-3 py-6 text-center transition-colors hover:border-primary/50 hover:bg-muted/40">
              <Upload className="size-5 text-muted-foreground" /><span className="mt-2 text-xs font-semibold">Drop CSV or Excel</span><span className="mt-1 text-[11px] text-muted-foreground">.csv, .xlsx, .xls · 20 MB</span>
            </button>
            <input ref={fileRef} className="hidden" type="file" accept=".csv,.xlsx,.xls" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readFile(file); event.target.value = ""; }} />
            {fileError && <p className="mt-2 text-xs text-destructive">{fileError}</p>}
            <Input className="mt-3" value={name} onChange={(event) => setName(event.target.value)} aria-label="Dataset name" />
            {Object.keys(sheets).length > 1 && <Field label="Sheet"><Picker value={sheet} options={Object.keys(sheets)} onChange={(value) => { setSheet(value); setRows(sheets[value] ?? []); }} /></Field>}
          </section>

          {saved.length > 0 && <section className="rounded-md border border-border bg-card p-4"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Saved on this device</h2><Button variant="ghost" size="icon" className="size-7" onClick={() => { localStorage.removeItem(STORAGE_KEY); setSaved([]); }} aria-label="Delete saved datasets"><Trash2 /></Button></div><div className="mt-2 space-y-1">{saved.map((item) => <button key={item.id} onClick={() => { setName(item.name); setRows(item.rows); }} className="w-full rounded-md px-2 py-2 text-left hover:bg-muted"><span className="block truncate text-xs font-medium">{item.name}</span><span className="text-[10px] text-muted-foreground">{item.rows.length} saved rows</span></button>)}</div></section>}

          <section className="rounded-md border border-border bg-card p-4"><h2 className="text-sm font-semibold">Variables</h2><Field label="X / category"><Picker value={xColumn} options={numericColumns} onChange={setXColumn} /></Field><Field label="Y / measure"><Picker value={yColumn} options={numericColumns} onChange={setYColumn} /></Field><Field label="Group"><Picker value={groupColumn || "none"} options={["none", ...textColumns]} labels={{ none: "No grouping" }} onChange={(value) => setGroupColumn(value === "none" ? "" : value)} /></Field></section>
        </aside>

        <div className="min-w-0">
          <div className="grid gap-3 sm:grid-cols-4">
            <Metric label="Rows" value={String(rows.length)} /><Metric label="Columns" value={String(columns.length)} /><Metric label="Numeric" value={String(numericColumns.length)} /><Metric label="Missing" value={String(profiles.reduce((total, profile) => total + profile.missing, 0))} />
          </div>

          <Tabs defaultValue="visualize" className="mt-5">
            <TabsList className="grid h-auto w-full grid-cols-4"><TabsTrigger value="visualize">Visualize</TabsTrigger><TabsTrigger value="statistics">Statistics</TabsTrigger><TabsTrigger value="data">Data</TabsTrigger><TabsTrigger value="insights">AI insights</TabsTrigger></TabsList>
            <TabsContent value="visualize" className="mt-4">
              <section className="rounded-md border border-border bg-card p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-xl font-semibold">Explore relationships</h2><p className="text-xs text-muted-foreground">Up to 300 points are displayed for clarity.</p></div><div className="flex flex-wrap gap-1">{(["bar", "line", "scatter", "histogram", "correlation"] as ChartType[]).map((type) => <Button key={type} variant={chartType === type ? "default" : "ghost"} size="sm" onClick={() => setChartType(type)}>{type === "scatter" ? <ScatterIcon /> : type === "line" ? <LineChartIcon /> : <BarChart3 />}<span className="capitalize">{type}</span></Button>)}</div></div>
                <div className="mt-6 min-h-80">
                  {chartType === "correlation" ? <CorrelationMatrix rows={correlationRows} columns={numericColumns} /> :
                    <ChartContainer config={chartConfig} className="h-[26rem] w-full aspect-auto">{
                      chartType === "histogram" ? <BarChart data={histogramRows}><CartesianGrid vertical={false} /><XAxis dataKey="bin" tickLine={false} axisLine={false} interval="preserveStartEnd" /><YAxis /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="count" fill="var(--color-count)" radius={[3,3,0,0]} /></BarChart> :
                      chartType === "scatter" ? <ScatterChart><CartesianGrid /><XAxis type="number" dataKey={xColumn} name={xColumn} /><YAxis type="number" dataKey={yColumn} name={yColumn} /><ZAxis range={[48,48]} /><Tooltip cursor={{ strokeDasharray: "3 3" }} /><Scatter data={plottedRows} fill="var(--color-primary)" /></ScatterChart> :
                      chartType === "line" ? <LineChart data={plottedRows}><CartesianGrid vertical={false} /><XAxis dataKey={xColumn || "row"} /><YAxis /><ChartTooltip content={<ChartTooltipContent />} /><Line type="monotone" dataKey={yColumn} stroke="var(--color-primary)" strokeWidth={2} dot={false} /></LineChart> :
                      <BarChart data={plottedRows.slice(0, 40)}><CartesianGrid vertical={false} /><XAxis dataKey={xColumn || "row"} /><YAxis /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey={yColumn} fill="var(--color-primary)" radius={[3,3,0,0]} /></BarChart>
                    }</ChartContainer>}
                </div>
              </section>
            </TabsContent>

            <TabsContent value="statistics" className="mt-4 space-y-4">
              <section className="grid gap-4 lg:grid-cols-3"><Result title="Correlation" value={formatNumber(correlationValue)} detail={`${xColumn || "X"} with ${yColumn || "Y"}`} /><Result title="Linear regression" value={regressionValue ? `y = ${formatNumber(regressionValue.m)}x + ${formatNumber(regressionValue.b)}` : "—"} detail={`R² ${formatNumber(regressionValue?.r2)} · n=${regressionValue?.count ?? 0}`} /><Result title={test?.label ?? "T-test"} value={formatNumber(test?.statistic)} detail={test?.groups ?? "Select valid variables"} /></section>
              <section className="rounded-md border border-border bg-card p-4"><div className="flex flex-wrap items-end gap-3"><div><h2 className="font-display text-xl font-semibold">Hypothesis test</h2><p className="text-xs text-muted-foreground">Use a group for a two-sample test, or no group for a one-sample test.</p></div>{!groupColumn && <label className="ml-auto text-xs font-medium">Expected mean<Input className="mt-1 w-32" type="number" value={expected} onChange={(event) => setExpected(event.target.value)} /></label>}</div></section>
              <section className="rounded-md border border-border bg-card"><Table><TableHeader><TableRow><TableHead>Variable</TableHead><TableHead>n</TableHead><TableHead>Missing</TableHead><TableHead>Mean</TableHead><TableHead>Median</TableHead><TableHead>SD</TableHead><TableHead>Min</TableHead><TableHead>Q1</TableHead><TableHead>Q3</TableHead><TableHead>Max</TableHead></TableRow></TableHeader><TableBody>{profiles.filter((profile) => profile.type === "numeric").map((profile) => <TableRow key={profile.name}><TableCell className="font-medium">{profile.name}</TableCell><TableCell>{profile.count}</TableCell><TableCell>{profile.missing}</TableCell><TableCell>{formatNumber(profile.mean)}</TableCell><TableCell>{formatNumber(profile.median)}</TableCell><TableCell>{formatNumber(profile.standardDeviation)}</TableCell><TableCell>{formatNumber(profile.minimum)}</TableCell><TableCell>{formatNumber(profile.q1)}</TableCell><TableCell>{formatNumber(profile.q3)}</TableCell><TableCell>{formatNumber(profile.maximum)}</TableCell></TableRow>)}</TableBody></Table></section>
            </TabsContent>

            <TabsContent value="data" className="mt-4"><section className="rounded-md border border-border bg-card"><div className="border-b border-border p-4"><h2 className="font-display text-xl font-semibold">Data preview</h2><p className="text-xs text-muted-foreground">Showing the first 100 rows. Empty values are marked as missing.</p></div><Table><TableHeader><TableRow><TableHead>#</TableHead>{columns.map((column) => <TableHead key={column}>{column}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.slice(0, 100).map((row, index) => <TableRow key={index}><TableCell className="text-muted-foreground">{index + 1}</TableCell>{columns.map((column) => <TableCell key={column} className="max-w-56 truncate">{row[column] == null ? <span className="text-muted-foreground">Missing</span> : String(row[column])}</TableCell>)}</TableRow>)}</TableBody></Table></section></TabsContent>

            <TabsContent value="insights" className="mt-4"><section className="rounded-md border border-border bg-card p-4 sm:p-6"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-secondary text-secondary-foreground"><BrainCircuit /></span><div><h2 className="font-display text-xl font-semibold">Interpret the analysis</h2><p className="text-xs text-muted-foreground">Only aggregate statistics are sent for interpretation; uploaded rows stay on this device.</p></div></div><Textarea className="mt-5 min-h-24" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What patterns, anomalies, or limitations should I focus on?" /><Button className="mt-3" onClick={() => void requestInsights()} disabled={busy || !rows.length}>{busy ? <Loader2 className="animate-spin" /> : <Sparkles />} Interpret results</Button>{insightsError && <p className="mt-4 text-sm text-destructive">{insightsError}</p>}{insights && <div className="mt-5 whitespace-pre-wrap rounded-md border border-border bg-background p-4 text-sm leading-7">{insights}</div>}</section></TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}

function Picker({ value, options, onChange, labels = {} }: { value: string; options: string[]; onChange: (value: string) => void; labels?: Record<string, string> }) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{options.map((option) => <SelectItem key={option} value={option}>{labels[option] ?? option}</SelectItem>)}</SelectContent></Select>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="mt-3 block text-xs font-medium"><span className="mb-1 block text-muted-foreground">{label}</span>{children}</label>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-md border border-border bg-card px-4 py-3"><p className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</p><p className="mt-1 font-display text-2xl font-semibold">{value}</p></div>; }
function Result({ title, value, detail }: { title: string; value: string; detail: string }) { return <div className="rounded-md border border-border bg-card p-4"><div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><FlaskConical className="size-3.5" />{title}</div><p className="mt-3 break-words font-display text-xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>; }
function CorrelationMatrix({ rows, columns }: { rows: Array<{ column: string; values: Array<number | null> }>; columns: string[] }) { return <div className="overflow-auto"><table className="min-w-full border-separate border-spacing-1 text-xs"><thead><tr><th /><th>{columns.join(" · ")}</th></tr></thead><tbody>{rows.map((row) => <tr key={row.column}><th className="pr-2 text-right font-medium">{row.column}</th><td><div className="flex flex-wrap gap-1">{row.values.map((value, index) => <span key={columns[index]} title={`${row.column} × ${columns[index]}`} className="grid size-14 place-items-center rounded-md border border-border bg-muted font-mono">{formatNumber(value)}</span>)}</div></td></tr>)}</tbody></table></div>; }