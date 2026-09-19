import { createFileRoute } from "@tanstack/react-router";

type Block = Record<string, unknown>;

const PROMPT =
  "You are an academic research assistant. Analyze the attached material and reply in markdown with: a one-paragraph summary, key findings as bullets, methods used, limitations, and how it could be cited in a literature review. Be concise and factual.";

function toBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Minimal DOCX reader: pull word/document.xml out of the zip and strip tags. */
async function docxToText(bytes: Uint8Array): Promise<string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  for (let i = 0; i < bytes.length - 4; i += 1) {
    if (view.getUint32(i, true) !== 0x04034b50) continue;
    const method = view.getUint16(i + 8, true);
    const compressedSize = view.getUint32(i + 18, true);
    const nameLength = view.getUint16(i + 26, true);
    const extraLength = view.getUint16(i + 28, true);
    const nameStart = i + 30;
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
    const dataStart = nameStart + nameLength + extraLength;
    if (name !== "word/document.xml" || compressedSize === 0) continue;
    const raw = bytes.subarray(dataStart, dataStart + compressedSize);
    let xml: string;
    if (method === 0) {
      xml = decoder.decode(raw);
    } else {
      const rawCopy = new Uint8Array(raw.length);
      rawCopy.set(raw);
      const stream = new Blob([rawCopy.buffer as ArrayBuffer])
        .stream()
        .pipeThrough(new DecompressionStream("deflate-raw"));
      xml = await new Response(stream).text();
    }
    return xml
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  throw new Error("Could not read this Word document.");
}

export const Route = createFileRoute("/api/analyze")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const form = await request.formData();
        const question = String(form.get("question") ?? "").trim();
        const link = String(form.get("url") ?? "").trim();
        const file = form.get("file");

        const blocks: Block[] = [{ type: "text", text: question || PROMPT }];

        if (file instanceof File) {
          if (file.size === 0) return new Response("That file is empty.", { status: 400 });
          if (file.size > 20 * 1024 * 1024) return new Response("Files must be under 20 MB.", { status: 413 });

          const bytes = new Uint8Array(await file.arrayBuffer());
          const mime = file.type || "application/octet-stream";
          const name = file.name.toLowerCase();

          if (mime.startsWith("image/")) {
            blocks.push({ type: "image_url", image_url: { url: `data:${mime};base64,${toBase64(bytes)}` } });
          } else if (mime.startsWith("video/")) {
            blocks.push({ type: "video_url", video_url: { url: `data:${mime};base64,${toBase64(bytes)}` } });
          } else if (mime === "application/pdf" || name.endsWith(".pdf")) {
            blocks.push({
              type: "file",
              file: { filename: file.name, file_data: `data:application/pdf;base64,${toBase64(bytes)}` },
            });
          } else if (name.endsWith(".docx")) {
            try {
              const text = await docxToText(bytes);
              blocks.push({ type: "text", text: `Document "${file.name}":\n\n${text.slice(0, 120000)}` });
            } catch (error) {
              return new Response(error instanceof Error ? error.message : "Unreadable document", { status: 400 });
            }
          } else {
            blocks.push({ type: "text", text: `File "${file.name}":\n\n${new TextDecoder().decode(bytes).slice(0, 120000)}` });
          }
        } else if (link) {
          if (/\.(png|jpe?g|webp|gif)(\?|$)/i.test(link)) {
            blocks.push({ type: "image_url", image_url: { url: link } });
          } else if (/\.(mp4|mov|webm)(\?|$)/i.test(link)) {
            blocks.push({ type: "video_url", video_url: { url: link } });
          } else {
            const page = await fetch(link).catch(() => null);
            if (!page?.ok) return new Response("That link could not be opened.", { status: 400 });
            const type = page.headers.get("content-type") ?? "";
            if (type.includes("pdf")) {
              const bytes = new Uint8Array(await page.arrayBuffer());
              blocks.push({
                type: "file",
                file: { filename: "linked.pdf", file_data: `data:application/pdf;base64,${toBase64(bytes)}` },
              });
            } else {
              const html = await page.text();
              const text = html
                .replace(/<script[\s\S]*?<\/script>/gi, "")
                .replace(/<style[\s\S]*?<\/style>/gi, "")
                .replace(/<[^>]+>/g, " ")
                .replace(/\s+/g, " ")
                .trim();
              blocks.push({ type: "text", text: `Page ${link}:\n\n${text.slice(0, 80000)}` });
            }
          }
        } else {
          return new Response("Attach a file or paste a link.", { status: 400 });
        }

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3.8-flash",
            messages: [
              { role: "system", content: PROMPT },
              { role: "user", content: blocks },
            ],
          }),
        });

        if (!upstream.ok) {
          const body = await upstream.text().catch(() => "");
          return new Response(body || "Analysis failed", { status: upstream.status });
        }

        const data = (await upstream.json()) as { choices?: Array<{ message?: { content?: string } }> };
        return Response.json({ analysis: data.choices?.[0]?.message?.content ?? "" });
      },
    },
  },
});
