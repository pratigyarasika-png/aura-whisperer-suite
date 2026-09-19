/** Browser-side helpers for microphone capture, transcription and image streaming. */

function writeString(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
}

/** Encode mono Float32 PCM chunks into a complete 16-bit WAV file. */
export function encodeWav(chunks: Float32Array[], sampleRate: number): Blob {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const samples = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    samples.set(chunk, offset);
    offset += chunk.length;
  }

  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  let position = 44;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(position, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    position += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export type Recorder = {
  stop: () => Promise<Blob>;
};

export async function startRecording(): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const AudioCtor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtor();
  const source = ctx.createMediaStreamSource(stream);
  const node = ctx.createScriptProcessor(4096, 1, 1);
  const pcm: Float32Array[] = [];
  node.onaudioprocess = (event) => pcm.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  source.connect(node);
  node.connect(ctx.destination);

  return {
    stop: async () => {
      stream.getTracks().forEach((track) => track.stop());
      node.disconnect();
      source.disconnect();
      const blob = encodeWav(pcm, ctx.sampleRate);
      await ctx.close();
      return blob;
    },
  };
}

export async function transcribe(blob: Blob): Promise<string> {
  const form = new FormData();
  form.append("file", blob, "recording.wav");
  const res = await fetch("/api/transcribe", { method: "POST", body: form });
  if (!res.ok) throw new Error((await res.text().catch(() => "")) || "Transcription failed");
  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}

/** Stream an AI-generated image, calling back with each frame as a data URL. */
export async function streamImage(
  prompt: string,
  onFrame: (dataUrl: string, isFinal: boolean) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch("/api/generate-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
    signal: signal ?? null,
  });
  if (!res.ok || !res.body) {
    throw new Error((await res.text().catch(() => "")) || "Image generation failed");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawFrame = false;

  const handle = (payload: string) => {
    if (!payload || payload === "[DONE]") return;
    let event: any;
    try {
      event = JSON.parse(payload);
    } catch {
      return;
    }
    const b64 = event?.b64_json ?? event?.data?.[0]?.b64_json;
    if (typeof b64 === "string" && b64) {
      sawFrame = true;
      onFrame(`data:image/png;base64,${b64}`, event?.type ? String(event.type).endsWith("completed") : true);
    }
    if (event?.error) throw new Error(event.error.message ?? "Image generation failed");
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      for (const line of part.split("\n")) {
        if (line.startsWith("data:")) handle(line.slice(5).trim());
      }
    }
  }

  if (!sawFrame) {
    // Replay once without streaming when no frame arrived.
    const fallback = await fetch("/api/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, stream: false }),
    });
    if (!fallback.ok) throw new Error((await fallback.text().catch(() => "")) || "Image generation failed");
    const json = (await fallback.json()) as { data?: Array<{ b64_json?: string }> };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw new Error("The model returned no image.");
    onFrame(`data:image/png;base64,${b64}`, true);
  }
}
