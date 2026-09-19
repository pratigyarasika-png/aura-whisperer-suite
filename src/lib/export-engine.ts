import { formatReference, type CitationStyle, type SavedPaper } from "@/lib/library";
import type { DocBlock } from "@/lib/exporters";

export type SlideCard = { title: string; bullets: string[] };

/** Turn manuscript blocks into presentation cards: each heading starts a slide. */
export function blocksToSlides(title: string, blocks: DocBlock[]): SlideCard[] {
  const slides: SlideCard[] = [];
  let current: SlideCard | null = null;

  for (const block of blocks) {
    if (block.type === "heading") {
      current = { title: block.text, bullets: [] };
      slides.push(current);
      continue;
    }
    if (!current) {
      current = { title, bullets: [] };
      slides.push(current);
    }
    const text = block.text.length > 240 ? `${block.text.slice(0, 237)}…` : block.text;
    if (current.bullets.length < 7) current.bullets.push(text);
  }

  return slides.length ? slides : [{ title, bullets: ["Add content to the manuscript to build slides."] }];
}

const safeName = (name: string) =>
  (name.trim() || "manuscript").replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").slice(0, 60).toLowerCase();

/** Editable PowerPoint deck built from outline cards. */
export async function exportPptx(title: string, slides: SlideCard[], subtitle?: string) {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const deck = new PptxGenJS();
  deck.layout = "LAYOUT_16x9";
  deck.title = title;

  const cover = deck.addSlide();
  cover.background = { color: "0F172A" };
  cover.addText(title, {
    x: 0.7,
    y: 1.7,
    w: 8.6,
    h: 1.5,
    fontSize: 34,
    bold: true,
    color: "FFFFFF",
    fontFace: "Arial",
  });
  cover.addText(subtitle ?? new Date().toLocaleDateString(), {
    x: 0.7,
    y: 3.2,
    w: 8.6,
    h: 0.6,
    fontSize: 15,
    color: "A5B4CB",
    fontFace: "Arial",
  });

  for (const slide of slides) {
    const page = deck.addSlide();
    page.addText(slide.title, {
      x: 0.6,
      y: 0.45,
      w: 8.8,
      h: 0.9,
      fontSize: 26,
      bold: true,
      color: "0F172A",
      fontFace: "Arial",
    });
    if (slide.bullets.length) {
      page.addText(
        slide.bullets.map((text) => ({ text, options: { bullet: true, breakLine: true } })),
        { x: 0.8, y: 1.5, w: 8.4, h: 3.6, fontSize: 15, color: "1F2937", fontFace: "Arial", lineSpacingMultiple: 1.2 },
      );
    }
  }

  await deck.writeFile({ fileName: `${safeName(title)}.pptx` });
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Publication-ready PDF through the browser print pipeline: real academic
 * typography, widow/orphan control and page breaks the canvas route cannot do.
 */
export function exportReportPdf(
  title: string,
  blocks: DocBlock[],
  references: SavedPaper[],
  style: CitationStyle,
) {
  const body = blocks
    .map((block) => {
      const text = escapeHtml(block.text);
      if (block.type === "heading") return `<h2>${text}</h2>`;
      if (block.type === "bullet") return `<li>${text}</li>`;
      return `<p>${text}</p>`;
    })
    .join("\n")
    .replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, "<ul>$1</ul>");

  const refs = references.length
    ? `<h2 class="refs">References</h2>${references
        .map((paper, index) => `<p class="ref">${escapeHtml(formatReference(paper, style, index + 1))}</p>`)
        .join("")}`
    : "";

  const html = `<!doctype html><html><head><meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  @page { size: letter; margin: 25mm 22mm; }
  body { font-family: "Times New Roman", Georgia, serif; font-size: 12pt; line-height: 1.7; color: #111; }
  h1 { font-size: 20pt; text-align: center; margin: 0 0 6mm; }
  h2 { font-size: 13.5pt; margin: 8mm 0 3mm; page-break-after: avoid; }
  p { margin: 0 0 3.2mm; text-align: justify; orphans: 3; widows: 3; }
  ul { margin: 0 0 3.2mm 6mm; padding: 0; }
  li { margin-bottom: 1.6mm; }
  .refs { page-break-before: always; }
  .ref { padding-left: 8mm; text-indent: -8mm; text-align: left; }
  .meta { text-align: center; font-size: 10pt; color: #555; margin-bottom: 10mm; }
</style></head><body>
<h1>${escapeHtml(title)}</h1>
<p class="meta">${new Date().toLocaleDateString()}</p>
${body}
${refs}
<script>window.onload = function () { window.focus(); window.print(); };</script>
</body></html>`;

  const win = window.open("", "_blank", "width=920,height=1100");
  if (!win) throw new Error("Allow pop-ups to build the print-ready PDF.");
  win.document.write(html);
  win.document.close();
}

/** Download the file, then open Google Drive so the user can drop it into Docs/Slides. */
export function openGoogleDrive() {
  window.open("https://drive.google.com/drive/my-drive", "_blank", "noopener");
}
