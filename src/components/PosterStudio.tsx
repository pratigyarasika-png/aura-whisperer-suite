import { LayoutTemplate, Loader2, Plus, Printer, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { streamAssist } from "@/lib/assist-client";
import { cn } from "@/lib/utils";

type Section = { heading: string; body: string };
type Layout = "two" | "three" | "infographic";

const LAYOUTS: Array<{ id: Layout; label: string }> = [
  { id: "two", label: "Two columns" },
  { id: "three", label: "Three columns" },
  { id: "infographic", label: "Infographic" },
];

const DEFAULT_SECTIONS: Section[] = [
  { heading: "Background", body: "Why this question matters." },
  { heading: "Methods", body: "Design, sample and analysis." },
  { heading: "Results", body: "Key findings and effect sizes." },
  { heading: "Conclusion", body: "What this changes for the field." },
];

function esc(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function posterHtml(title: string, authors: string, sections: Section[], layout: Layout, accent: string) {
  const columns = layout === "three" ? 3 : 2;
  const cards = sections
    .map(
      (section) => `<section style="break-inside:avoid;border:1px solid #e5e7eb;border-left:6px solid ${accent};border-radius:14px;padding:14px 16px;margin:0 0 14px">
  <h3 style="margin:0 0 6px;font-size:15px;color:${accent}">${esc(section.heading)}</h3>
  <p style="margin:0;font-size:12px;line-height:1.6;white-space:pre-wrap">${esc(section.body)}</p>
</section>`,
    )
    .join("");

  const body =
    layout === "infographic"
      ? `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px">${sections
          .map(
            (section) => `<div style="border-radius:16px;background:${accent}14;padding:16px;text-align:center">
  <p style="margin:0;font-size:13px;font-weight:700;color:${accent}">${esc(section.heading)}</p>
  <p style="margin:6px 0 0;font-size:12px;line-height:1.6;white-space:pre-wrap">${esc(section.body)}</p>
</div>`,
          )
          .join("")}</div>`
      : `<div style="column-count:${columns};column-gap:16px">${cards}</div>`;

  return `<article class="orbis-poster" style="border:1px solid #e5e7eb;border-radius:20px;padding:22px;background:#fff;color:#111">
  <header style="border-bottom:4px solid ${accent};padding-bottom:12px;margin-bottom:16px">
    <h2 style="margin:0;font-size:22px;line-height:1.25">${esc(title)}</h2>
    <p style="margin:6px 0 0;font-size:12px;color:#555">${esc(authors)}</p>
  </header>
  ${body}
</article>`;
}

type Props = { onInsert?: (html: string) => void };

/** Academic poster and infographic layout builder. */
export function PosterStudio({ onInsert }: Props) {
  const [title, setTitle] = useState("Sleep and memory consolidation: a systematic review");
  const [authors, setAuthors] = useState("A. Researcher, B. Colleague — Department of Cognitive Science");
  const [sections, setSections] = useState<Section[]>(DEFAULT_SECTIONS);
  const [layout, setLayout] = useState<Layout>("two");
  const [accent, setAccent] = useState("#2563EB");
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const html = posterHtml(title, authors, sections, layout, accent);

  const update = (index: number, patch: Partial<Section>) =>
    setSections((current) => current.map((section, i) => (i === index ? { ...section, ...patch } : section)));

  const draft = async () => {
    if (!title.trim()) return;
    setDrafting(true);
    setError(null);
    let collected = "";
    try {
      await streamAssist(
        {
          mode: "flash",
          instruction: `Write conference poster content for the sections: ${sections
            .map((section) => section.heading)
            .join(", ")}. Return each section as "## Heading" followed by two or three short sentences. No other text.`,
          question: title,
        },
        (delta) => {
          collected += delta;
        },
      );
      const parsed = collected
        .split(/^##\s+/m)
        .slice(1)
        .map((block) => {
          const [head, ...rest] = block.split("\n");
          return { heading: (head ?? "").trim(), body: rest.join("\n").trim() };
        })
        .filter((section) => section.heading);
      if (parsed.length) setSections(parsed);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not draft the poster.");
    } finally {
      setDrafting(false);
    }
  };

  const print = () => {
    const win = window.open("", "_blank", "width=1100,height=800");
    if (!win) return;
    win.document.write(
      `<!doctype html><title>${esc(title)}</title><body style="margin:24px;font-family:system-ui,sans-serif">${html}</body>`,
    );
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <div className="space-y-3">
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        aria-label="Poster title"
        className="w-full rounded-2xl border border-input bg-background px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-ring"
      />
      <input
        value={authors}
        onChange={(event) => setAuthors(event.target.value)}
        aria-label="Authors and affiliation"
        className="w-full rounded-2xl border border-input bg-background px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-ring"
      />

      <div className="flex flex-wrap items-center gap-1.5">
        {LAYOUTS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setLayout(item.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors",
              layout === item.id ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {item.label}
          </button>
        ))}
        <input
          type="color"
          value={accent}
          onChange={(event) => setAccent(event.target.value.toUpperCase())}
          aria-label="Poster accent colour"
          className="ml-auto size-8 cursor-pointer rounded-full border-0 bg-transparent p-0"
        />
      </div>

      <Button variant="outline" className="h-9 w-full rounded-full text-xs" onClick={() => void draft()} disabled={drafting}>
        {drafting ? <Loader2 className="animate-spin" /> : <Sparkles />} Draft sections with AI
      </Button>
      {error && <p className="text-[11px] text-destructive">{error}</p>}

      <div className="space-y-2">
        {sections.map((section, index) => (
          <div key={index} className="rounded-2xl border border-border p-2">
            <div className="flex items-center gap-2">
              <input
                value={section.heading}
                onChange={(event) => update(index, { heading: event.target.value })}
                aria-label={`Section ${index + 1} heading`}
                className="min-w-0 flex-1 bg-transparent text-[11px] font-semibold outline-none"
              />
              <Button
                variant="ghost"
                size="icon"
                className="size-7 rounded-full"
                onClick={() => setSections((current) => current.filter((_, i) => i !== index))}
                aria-label={`Remove ${section.heading}`}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <Textarea
              value={section.body}
              onChange={(event) => update(index, { body: event.target.value })}
              aria-label={`Section ${index + 1} body`}
              className="mt-1 min-h-16 resize-none rounded-xl text-[11px]"
            />
          </div>
        ))}
        <Button
          variant="outline"
          className="h-8 w-full rounded-full text-[11px]"
          onClick={() => setSections((current) => [...current, { heading: "New section", body: "" }])}
        >
          <Plus /> Add section
        </Button>
      </div>

      <div className="overflow-auto rounded-2xl border border-border bg-muted/40 p-3">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-muted-foreground">
          <LayoutTemplate className="size-3.5" /> Preview
        </p>
        <div className="origin-top scale-[0.92]" dangerouslySetInnerHTML={{ __html: html }} />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="outline" className="h-9 rounded-full text-xs" onClick={print}>
          <Printer /> Print / save as PDF
        </Button>
        {onInsert && (
          <Button className="h-9 rounded-full text-xs" onClick={() => onInsert(`${html}<p></p>`)}>
            Insert into manuscript
          </Button>
        )}
      </div>
    </div>
  );
}
