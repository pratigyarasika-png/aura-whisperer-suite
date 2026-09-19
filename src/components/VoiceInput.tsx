import { Loader2, Mic, Square } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { startRecording, transcribe, type Recorder } from "@/lib/media-client";
import { cn } from "@/lib/utils";

type Props = {
  onText: (text: string) => void;
  className?: string;
  label?: string;
};

/** Microphone button: records, transcribes, and hands the text back. */
export function VoiceInput({ onText, className, label = "Dictate" }: Props) {
  const recorder = useRef<Recorder | null>(null);
  const [state, setState] = useState<"idle" | "recording" | "working">("idle");
  const [error, setError] = useState<string | null>(null);

  const begin = async () => {
    setError(null);
    try {
      recorder.current = await startRecording();
      setState("recording");
    } catch {
      setError("Microphone access is needed to dictate.");
    }
  };

  const finish = async () => {
    const active = recorder.current;
    recorder.current = null;
    if (!active) return;
    setState("working");
    try {
      const blob = await active.stop();
      const text = await transcribe(blob);
      if (text) onText(text);
      else setError("Nothing was heard — try again.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Transcription failed.");
    } finally {
      setState("idle");
    }
  };

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Button
        type="button"
        variant={state === "recording" ? "default" : "outline"}
        size="icon"
        className={cn("size-9 shrink-0 rounded-full", state === "recording" && "animate-pulse")}
        onClick={() => (state === "recording" ? void finish() : void begin())}
        disabled={state === "working"}
        aria-label={state === "recording" ? "Stop recording" : label}
        title={state === "recording" ? "Stop recording" : label}
      >
        {state === "working" ? (
          <Loader2 className="animate-spin" />
        ) : state === "recording" ? (
          <Square />
        ) : (
          <Mic />
        )}
      </Button>
      {error && <span className="text-[11px] text-destructive">{error}</span>}
    </span>
  );
}
