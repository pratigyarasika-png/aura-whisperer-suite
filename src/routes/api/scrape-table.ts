import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({ url: z.string().url().max(2000) });

const decodeEntities = (value: string) =>
  value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));

const stripTags = (html: string) =>
  decodeEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

/** Extract every HTML <table> on a page into a matrix of cell strings. */
function extractTables(html: string) {
  const tables: { caption: string; matrix: string[][] }[] = [];
  const tableMatches = html.match(/<table[\s\S]*?<\/table>/gi) ?? [];

  for (const table of tableMatches) {
    const captionMatch = table.match(/<caption[^>]*>([\s\S]*?)<\/caption>/i);
    const rows = table.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
    const matrix: string[][] = [];
    for (const row of rows) {
      const cells = row.match(/<(td|th)[\s\S]*?<\/\1>/gi) ?? [];
      const values = cells.map((cell) => stripTags(cell));
      if (values.some((v) => v !== "")) matrix.push(values);
    }
    const width = Math.max(0, ...matrix.map((r) => r.length));
    if (matrix.length >= 2 && width >= 2) {
      tables.push({
        caption: captionMatch ? stripTags(captionMatch[1] ?? "") : "",
        matrix: matrix.map((r) => [...r, ...Array(width - r.length).fill("")]),
      });
    }
  }
  return tables;
}

export const Route = createFileRoute("/api/scrape-table")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: z.infer<typeof bodySchema>;
        try {
          body = bodySchema.parse(await request.json());
        } catch {
          return new Response("Provide a valid http(s) URL.", { status: 400 });
        }

        const target = new URL(body.url);
        if (target.protocol !== "http:" && target.protocol !== "https:") {
          return new Response("Only http and https URLs are supported.", { status: 400 });
        }

        let response: Response;
        try {
          response = await fetch(target, {
            headers: {
              "User-Agent": "Mozilla/5.0 (compatible; OrbisResearch/1.0)",
              Accept: "text/html,application/xhtml+xml",
            },
            redirect: "follow",
          });
        } catch {
          return new Response("Could not reach that page.", { status: 502 });
        }

        if (!response.ok) {
          return new Response(`The page returned status ${response.status}.`, { status: 502 });
        }

        const html = await response.text();
        const tables = extractTables(html);
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

        return Response.json({
          url: target.toString(),
          title: titleMatch ? stripTags(titleMatch[1] ?? "") : target.hostname,
          tables: tables.slice(0, 10),
        });
      },
    },
  },
});
