import { Loader2, Sparkles, Workflow } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { streamAssist } from "@/lib/assist-client";

const STARTER = `flowchart TD
  A[Research question] --> B[Literature search]
  B --> C[Screening]
  C --> D[Synthesis]
  D --> E[Manuscript]`;

type Props = { onInsert?: (html: string) => void };

/** Mermaid diagram editor with live rendering and an AI drafting helper. */
export function DiagramStudio({ onInsert }: Props) {
  const [code, setCode] = useState(STARTER);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [idea, setIdea] = useState("");
  const [drafting, setDrafting] = useState(false);
  const counter = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "neutral" });
        counter.current += 1;
        const { svg: rendered } = await mermaid.render(`orbis-diagram-${counter.current}`, code);
        if (!cancelled) {
          setSvg(rendered);
          setError(null);
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message.split("\n")[0]! : "Diagram syntax error");
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [code]);

  const draft = async () => {
    const prompt = idea.trim();
    if (!prompt) return;
    setDrafting(true);
    let collected = "";
    try {
      await streamAssist(
        {
          mode: "flash",
          instruction:
            "Return ONLY valid Mermaid.js diagram code, no markdown fences, no commentary. Use flowchart, sequenceDiagram or mindmap as appropriate. Avoid emojis and parentheses inside node labels.",
          question: prompt,
        },
        (delta) => {
          collected += delta;
        },
      );
      const cleaned = collected.replace(/```(?:mermaid)?/g, "").trim();
      if (cleaned) setCode(cleaned);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not draft that diagram.");
    } finally {
      setDrafting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <Textarea
          value={idea}
          onChange={(event) => setIdea(event.target.value)}
          placeholder="Describe a diagram — e.g. PRISMA screening flow for a systematic review"
          className="min-h-11 resize-none rounded-2xl text-xs"
        />
        <Button className="h-11 rounded-full px-4 text-xs" onClick={() => void draft()} disabled={!idea.trim() || drafting}>
          {drafting ? <Loader2 className="animate-spin" /> : <Sparkles />} Draft
        </Button>
      </div>

      <Textarea
        value={code}
        onChange={(event) => setCode(event.target.value)}
        aria-label="Mermaid diagram code"
        className="min-h-40 rounded-2xl font-mono text-[11px] leading-5"
      />

      {error && <p className="text-[11px] text-destructive">{error}</p>}

      <div className="grid min-h-40 place-items-center overflow-auto rounded-2xl border border-border bg-background p-3">
        {svg ? (
          <div className="mermaid-preview w-full [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Workflow className="size-3.5" /> The diagram preview appears here.
          </p>
        )}
      </div>

      {onInsert && (
        <Button
          className="h-9 w-full rounded-full text-xs"
          disabled={!svg}
          onClick={() => onInsert(`<figure class="orbis-figure">${svg}</figure><p></p>`)}
        >
          Insert diagram into manuscript
        </Button>
      )}
    </div>
  );
}
