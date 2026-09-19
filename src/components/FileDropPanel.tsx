import { FileUp, Link2, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ACCEPT = ".pdf,.docx,.txt,.md,image/*,video/*";

type Props = {
  /** Called with the analysis markdown when it is ready. */
  onAnalysis?: (text: string, label: string) => void;
  className?: string;
};

/** Drag-and-drop panel for PDFs, Word files, images, video and links. */
export function FileDropPanel({ onAnalysis, className }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [link, setLink] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState<string | null>(null);

  const run = async (body: FormData, name: string) => {
    setBusy(true);
    setError(null);
    setResult("");
    setLabel(name);
    try {
      const res = await fetch("/api/analyze", { method: "POST", body });
      if (!res.ok) throw new Error((await res.text().catch(() => "")) || "Analysis failed");
      const data = (await res.json()) as { analysis?: string };
      const text = (data.analysis ?? "").trim();
      setResult(text);
      if (text) onAnalysis?.(text, name);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Analysis failed.");
    } finally {
      setBusy(false);
    }
  };

  const analyzeFile = (file: File) => {
    const form = new FormData();
    form.append("file", file);
    void run(form, file.name);
  };

  const analyzeLink = () => {
    const url = link.trim();
    if (!url) return;
    const form = new FormData();
    form.append("url", url);
    void run(form, url);
  };

  return (
    <div className={cn("rounded-3xl border border-border bg-card p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase text-muted-foreground">Analyze a document</p>
        {result && (
          <Button variant="ghost" size="icon" className="size-7 rounded-full" onClick={() => setResult("")} aria-label="Clear analysis">
            <X className="size-3.5" />
          </Button>
        )}
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          const file = event.dataTransfer.files?.[0];
          if (file) analyzeFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => event.key === "Enter" && inputRef.current?.click()}
        className={cn(
          "mt-3 grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed px-4 py-7 text-center transition-colors",
          over ? "border-primary bg-accent" : "border-border hover:border-primary/50 hover:bg-muted/50",
        )}
      >
        <FileUp className="size-5 text-muted-foreground" />
        <p className="mt-2 text-xs font-semibold">Drop a PDF, Word file, image or video</p>
        <p className="mt-1 text-[11px] text-muted-foreground">or click to browse — up to 20 MB</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          aria-label="Upload a document to analyze"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) analyzeFile(file);
            event.target.value = "";
          }}
        />
      </div>

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-full border border-input bg-background px-3 py-1.5">
        <span className="flex min-w-0 items-center gap-2">
          <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={link}
            onChange={(event) => setLink(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && analyzeLink()}
            placeholder="or paste a paper link"
            aria-label="Paper link to analyze"
            className="min-w-0 flex-1 bg-transparent py-1 text-xs outline-none placeholder:text-muted-foreground"
          />
        </span>
        <Button size="sm" className="h-7 rounded-full px-3 text-[11px]" onClick={analyzeLink} disabled={!link.trim() || busy}>
          Analyze
        </Button>
      </div>

      {busy && (
        <p className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Reading {label}…
        </p>
      )}
      {error && <p className="mt-3 text-[11px] text-destructive">{error}</p>}
      {result && (
        <div className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-border bg-background p-3 text-xs leading-6">
          {result}
        </div>
      )}
    </div>
  );
}
