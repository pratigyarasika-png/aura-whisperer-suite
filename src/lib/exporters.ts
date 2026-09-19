import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import jsPDF from "jspdf";

import { formatReference, type CitationStyle, type SavedPaper } from "@/lib/library";

export type DocBlock = { type: "heading" | "paragraph" | "bullet"; text: string };

const safeName = (name: string) =>
  (name.trim() || "manuscript").replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").slice(0, 60).toLowerCase();

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Flatten the editor DOM into export blocks, keeping headings and lists. */
export function readBlocks(root: HTMLElement): DocBlock[] {
  const blocks: DocBlock[] = [];
  root.querySelectorAll<HTMLElement>("h1, h2, h3, p, li").forEach((node) => {
    const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!text) return;
    const tag = node.tagName.toLowerCase();
    blocks.push({
      type: tag === "li" ? "bullet" : tag.startsWith("h") ? "heading" : "paragraph",
      text,
    });
  });
  return blocks;
}

export async function exportDocx(
  title: string,
  blocks: DocBlock[],
  references: SavedPaper[],
  style: CitationStyle,
) {
  const children: Paragraph[] = blocks.map((block) => {
    if (block.type === "heading") {
      return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(block.text)] });
    }
    if (block.type === "bullet") {
      return new Paragraph({
        numbering: { reference: "orbis-bullets", level: 0 },
        children: [new TextRun(block.text)],
      });
    }
    return new Paragraph({ spacing: { after: 200 }, children: [new TextRun(block.text)] });
  });

  if (references.length) {
    children.push(
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("References")] }),
    );
    references.forEach((paper, index) => {
      children.push(
        new Paragraph({
          spacing: { after: 160 },
          children: [new TextRun(formatReference(paper, style, index + 1))],
        }),
      );
    });
  }

  const document_ = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 24 } } } },
    numbering: {
      config: [
        {
          reference: "orbis-bullets",
          levels: [
            {
              level: 0,
              format: "bullet" as never,
              text: "\u2022",
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(document_);
  download(blob, `${safeName(title)}.docx`);
}

export function exportPdf(
  title: string,
  blocks: DocBlock[],
  references: SavedPaper[],
  style: CitationStyle,
) {
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 64;
  const width = pdf.internal.pageSize.getWidth() - margin * 2;
  const bottom = pdf.internal.pageSize.getHeight() - margin;
  let y = margin;

  const write = (text: string, size: number, bold: boolean, indent = 0) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    for (const line of pdf.splitTextToSize(text, width - indent) as string[]) {
      if (y > bottom) {
        pdf.addPage();
        y = margin;
      }
      pdf.text(line, margin + indent, y);
      y += size * 1.5;
    }
    y += 6;
  };

  for (const block of blocks) {
    if (block.type === "heading") write(block.text, 16, true);
    else if (block.type === "bullet") write(`• ${block.text}`, 11, false, 18);
    else write(block.text, 11, false);
  }

  if (references.length) {
    write("References", 16, true);
    references.forEach((paper, index) => write(formatReference(paper, style, index + 1), 10, false));
  }

  pdf.save(`${safeName(title)}.pdf`);
}

const bibKey = (paper: SavedPaper, index: number) => {
  const author = (paper.authors[0] ?? "anon").split(/\s+/).pop() ?? "anon";
  return `${author.toLowerCase().replace(/[^a-z]/g, "")}${paper.year ?? ""}${index + 1}`;
};

export function exportBibtex(title: string, references: SavedPaper[]) {
  const entries = references.map((paper, index) =>
    [
      `@article{${bibKey(paper, index)},`,
      `  title = {${paper.title}},`,
      `  author = {${paper.authors.join(" and ")}},`,
      paper.year ? `  year = {${paper.year}},` : "",
      paper.venue ? `  journal = {${paper.venue}},` : "",
      paper.doi ? `  doi = {${paper.doi}},` : "",
      paper.url ? `  url = {${paper.url}},` : "",
      "}",
    ]
      .filter(Boolean)
      .join("\n"),
  );
  download(new Blob([entries.join("\n\n")], { type: "application/x-bibtex" }), `${safeName(title)}.bib`);
}

export function exportRis(title: string, references: SavedPaper[]) {
  const entries = references.map((paper) =>
    [
      "TY  - JOUR",
      ...paper.authors.map((author) => `AU  - ${author}`),
      `TI  - ${paper.title}`,
      paper.year ? `PY  - ${paper.year}` : "",
      paper.venue ? `JO  - ${paper.venue}` : "",
      paper.doi ? `DO  - ${paper.doi}` : "",
      paper.url ? `UR  - ${paper.url}` : "",
      "ER  - ",
    ]
      .filter(Boolean)
      .join("\n"),
  );
  download(new Blob([entries.join("\n\n")], { type: "application/x-research-info-systems" }), `${safeName(title)}.ris`);
}
