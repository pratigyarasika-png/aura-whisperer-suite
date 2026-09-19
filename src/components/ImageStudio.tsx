import { ImagePlus, Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { streamImage } from "@/lib/media-client";
import { cn } from "@/lib/utils";

const STYLES = [
  { id: "figure", label: "Scientific figure", hint: "clean labelled scientific figure, white background, vector style" },
  { id: "diagram", label: "Conceptual diagram", hint: "minimal conceptual diagram with labelled boxes and arrows" },
  { id: "illustration", label: "Illustration", hint: "editorial illustration for an academic article" },
  { id: "photo", label: "Photoreal", hint: "photorealistic image, natural lighting, high detail" },
] as const;

type Props = { onInsert?: (html: string) => void };

/** AI image generator for figures, diagrams and illustrations. */
export function ImageStudio({ onInsert }: Props) {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<(typeof STYLES)[number]["id"]>("figure");
  const [src, setSrc] = useState<string | null>(null);
  const [isFinal, setIsFinal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    const text = prompt.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    setSrc(null);
    setIsFinal(false);
    const hint = STYLES.find((item) => item.id === style)!.hint;
    try {
      await streamImage(`${text}. Style: ${hint}. No watermark, no gibberish text.`, (dataUrl, final) => {
        setSrc(dataUrl);
        if (final) setIsFinal(true);
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Image generation failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="Describe the figure — e.g. cross-section of the hippocampus with labelled subfields"
        className="min-h-20 rounded-2xl text-xs"
      />

      <div className="flex flex-wrap gap-1.5">
        {STYLES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setStyle(item.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors",
              style === item.id ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <Button className="h-9 w-full rounded-full text-xs" onClick={() => void generate()} disabled={!prompt.trim() || busy}>
        {busy ? <Loader2 className="animate-spin" /> : <ImagePlus />} Generate image
      </Button>

      {error && <p className="text-[11px] text-destructive">{error}</p>}

      <div className="grid min-h-40 place-items-center overflow-hidden rounded-2xl border border-border bg-background p-3">
        {src ? (
          <img
            src={src}
            alt={prompt}
            className={cn("max-h-72 w-auto rounded-xl transition-[filter] duration-500", isFinal ? "blur-0" : "blur-xl")}
          />
        ) : (
          <p className="text-[11px] text-muted-foreground">{busy ? "Generating…" : "Your generated figure appears here."}</p>
        )}
      </div>

      {onInsert && (
        <Button
          variant="outline"
          className="h-9 w-full rounded-full text-xs"
          disabled={!src || !isFinal}
          onClick={() => onInsert(`<figure class="orbis-figure"><img src="${src}" alt="${prompt.replace(/"/g, "'")}" /><figcaption>${prompt}</figcaption></figure><p></p>`)}
        >
          Insert figure into manuscript
        </Button>
      )}
    </div>
  );
}
