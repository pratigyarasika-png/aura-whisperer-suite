import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Download, FileUp, Loader2, Repeat2, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import { SyncBadge } from "@/components/SyncBadge";
import { Button } from "@/components/ui/button";
import {
  CONVERSIONS,
  downloadBlob,
  humanSize,
  suggestConversions,
  type ConversionId,
  type ConvertResult,
} from "@/lib/converter";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/converter")({
  head: () => ({
    meta: [
      { title: "Converter Hub — Orbis File Conversion" },
      {
        name: "description",
        content:
          "Convert PDF to Word or text, CSV to Excel or JSON, and images to PDF or OCR text entirely in your browser.",
      },
      { property: "og:title", content: "Converter Hub — Orbis File Conversion" },
      {
        property: "og:description",
        content: "Drag-and-drop private file conversion for documents, spreadsheets and images.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ConverterHub,
});

type Job = {
  id: string;
  file: File;
  conversion: ConversionId;
  label: string;
  status: "queued" | "running" | "done" | "error";
  progress: string;
  result?: ConvertResult;
  error?: string;
};

function ConverterHub() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [pending, setPending] = useState<File[]>([]);
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const patch = (id: string, next: Partial<Job>) =>
    setJobs((current) => current.map((job) => (job.id === id ? { ...job, ...next } : job)));

  const runConversion = async (file: File, conversionId: ConversionId, label: string) => {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    setJobs((current) => [
      { id, file, conversion: conversionId, label, status: "running", progress: "Starting…" },
      ...current,
    ]);
    const conversion = CONVERSIONS.find((item) => item.id === conversionId);
    if (!conversion) return;
    try {
      const result = await conversion.run(file, (progress) => patch(id, { progress }));
      patch(id, { status: "done", progress: "", result });
    } catch (caught) {
      patch(id, {
        status: "error",
        progress: "",
        error: caught instanceof Error ? caught.message : "Conversion failed.",
      });
    }
  };

  const addFiles = (files: FileList | File[]) => {
    const list = Array.from(files);
    setPending((current) => [...list, ...current].slice(0, 8));
    for (const file of list) {
      const options = suggestConversions(file.name);
      if (options.length === 1 && options[0]) void runConversion(file, options[0].id, options[0].label);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
          <Button asChild variant="ghost" size="sm" className="h-9 rounded-full px-3 text-xs">
            <Link to="/">
              <ArrowLeft className="mr-1 size-4" /> Orbis
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 truncate text-sm font-semibold">
              <Repeat2 className="size-4 text-primary" /> Converter Hub
            </h1>
            <p className="truncate text-[11px] text-muted-foreground">
              Documents, spreadsheets and images — converted on this device
            </p>
          </div>
          <SyncBadge className="ml-auto" />
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setOver(false);
            if (event.dataTransfer.files?.length) addFiles(event.dataTransfer.files);
          }}
          onClick={() => fileRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => event.key === "Enter" && fileRef.current?.click()}
          className={cn(
            "grid cursor-pointer place-items-center rounded-3xl border-2 border-dashed px-4 py-12 text-center transition-colors",
            over ? "border-primary bg-accent" : "border-border hover:border-primary/50 hover:bg-muted/40",
          )}
        >
          <FileUp className="size-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold">Drop PDF, CSV, Excel, JSON or image files</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            PDF → Word/Text · CSV ↔ Excel/JSON · Image → PDF or OCR text
          </p>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,.csv,.tsv,.txt,.xlsx,.xls,.json,image/*"
            className="hidden"
            aria-label="Files to convert"
            onChange={(event) => {
              if (event.target.files?.length) addFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </div>

        {pending.length > 0 && (
          <section className="space-y-3">
            <p className="text-[11px] font-semibold uppercase text-muted-foreground">Choose an output format</p>
            {pending.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">{file.name}</p>
                  <p className="text-[11px] text-muted-foreground">{humanSize(file.size)}</p>
                </div>
                {suggestConversions(file.name).map((conversion) => (
                  <Button
                    key={conversion.id}
                    size="sm"
                    variant="secondary"
                    className="h-8 rounded-full text-[11px]"
                    onClick={() => void runConversion(file, conversion.id, conversion.label)}
                  >
                    {conversion.label}
                  </Button>
                ))}
                {suggestConversions(file.name).length === 0 && (
                  <span className="text-[11px] text-destructive">No converter for this file type.</span>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 rounded-full"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => setPending((current) => current.filter((_, i) => i !== index))}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </section>
        )}

        <section className="space-y-3">
          <p className="text-[11px] font-semibold uppercase text-muted-foreground">Conversions</p>
          {jobs.length === 0 && (
            <p className="text-xs text-muted-foreground">Converted files appear here with instant downloads.</p>
          )}
          {jobs.map((job) => (
            <div key={job.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">
                  {job.file.name} <span className="text-muted-foreground">· {job.label}</span>
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {job.status === "running" && (job.progress || "Converting…")}
                  {job.status === "done" &&
                    `${job.result?.note ?? "Ready"} · ${humanSize(job.result?.blob.size ?? 0)}`}
                  {job.status === "error" && <span className="text-destructive">{job.error}</span>}
                </p>
              </div>
              {job.status === "running" && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
              {job.status === "done" && job.result && (
                <Button
                  size="sm"
                  className="h-8 rounded-full text-[11px]"
                  onClick={() => downloadBlob(job.result!.blob, job.result!.filename)}
                >
                  <Download className="mr-1 size-3.5" /> {job.result.filename.split(".").pop()?.toUpperCase()}
                </Button>
              )}
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
