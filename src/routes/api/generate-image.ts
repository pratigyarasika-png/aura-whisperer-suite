import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const { prompt, stream = true } = (await request.json()) as { prompt?: string; stream?: boolean };
        if (!prompt?.trim()) return new Response("A prompt is required", { status: 400 });

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "openai/gpt-image-2.5-sunburst",
            prompt,
            ...(stream ? { stream: true, partial_images: 1 } : {}),
          }),
        });

        if (!upstream.ok || !upstream.body) {
          return new Response(await upstream.text().catch(() => "Image generation failed"), {
            status: upstream.status,
          });
        }

        if (!stream) {
          return new Response(upstream.body, { headers: { "Content-Type": "application/json" } });
        }

        return new Response(upstream.body, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        });
      },
    },
  },
});
