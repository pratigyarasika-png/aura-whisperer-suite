/** Client-side file conversions — nothing leaves the browser. */
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";

import { parseDelimited, parsePdfFile } from "@/lib/dataset";

export type ConvertResult = { filename: string; blob: Blob; note: string };

export const baseName = (name: string) => name.replace(/\.[^.]+$/, "") || "converted";

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/* --------------------------------------------------------------- documents */

export async function pdfToTxt(file: File, onProgress?: (text: string) => void): Promise<ConvertResult> {
  onProgress?.("Reading PDF pages…");
  const extraction = await parsePdfFile(file);
  const text = extraction.text.trim() || "No selectable text was found in this PDF.";
  return {
    filename: `${baseName(file.name)}.txt`,
    blob: new Blob([text], { type: "text/plain;charset=utf-8" }),
    note: `${text.length.toLocaleString()} characters extracted`,
  };
}

/** Build a .docx from plain text, treating short standalone lines as headings. */
export async function textToDocx(name: string, text: string): Promise<ConvertResult> {
  const lines = text.split(/\r?\n/);
  const children: Paragraph[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const isHeading = trimmed.length < 80 && !/[.!?;,]$/.test(trimmed) && /^[A-Z0-9]/.test(trimmed);
    children.push(
      isHeading
        ? new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(trimmed)] })
        : new Paragraph({ spacing: { after: 180 }, children: [new TextRun(trimmed)] }),
    );
  }
  if (!children.length) children.push(new Paragraph({ children: [new TextRun("(empty document)")] }));

  const document_ = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 24 } } } },
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

  return {
    filename: `${baseName(name)}.docx`,
    blob: await Packer.toBlob(document_),
    note: `${children.length} paragraphs`,
  };
}

export async function pdfToDocx(file: File, onProgress?: (text: string) => void): Promise<ConvertResult> {
  onProgress?.("Extracting text…");
  const extraction = await parsePdfFile(file);
  onProgress?.("Building Word document…");
  return textToDocx(file.name, extraction.text);
}

/* ------------------------------------------------------------------ tables */

export async function csvToXlsx(file: File): Promise<ConvertResult> {
  const matrix = parseDelimited(await file.text());
  const sheet = XLSX.utils.aoa_to_sheet(matrix);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Sheet1");
  const array = XLSX.write(book, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return {
    filename: `${baseName(file.name)}.xlsx`,
    blob: new Blob([array], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    note: `${matrix.length} rows`,
  };
}

export async function csvToJson(file: File): Promise<ConvertResult> {
  const matrix = parseDelimited(await file.text());
  const [header = [], ...rows] = matrix;
  const records = rows
    .filter((row) => row.some((cell) => cell.trim() !== ""))
    .map((row) => Object.fromEntries(header.map((key, index) => [key || `col${index + 1}`, row[index] ?? ""])));
  const json = JSON.stringify(records, null, 2);
  return {
    filename: `${baseName(file.name)}.json`,
    blob: new Blob([json], { type: "application/json" }),
    note: `${records.length} records`,
  };
}

export async function xlsxToCsv(file: File): Promise<ConvertResult> {
  const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const first = book.SheetNames[0];
  if (!first) throw new Error("This workbook has no sheets.");
  const csv = XLSX.utils.sheet_to_csv(book.Sheets[first]!);
  return {
    filename: `${baseName(file.name)}.csv`,
    blob: new Blob([csv], { type: "text/csv;charset=utf-8" }),
    note: `Sheet "${first}" · ${csv.split("\n").length} rows`,
  };
}

export async function jsonToCsv(file: File): Promise<ConvertResult> {
  const parsed = JSON.parse(await file.text()) as unknown;
  const rows = Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [parsed as Record<string, unknown>];
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row ?? {}))));
  const escape = (value: unknown) => {
    const text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = [keys.join(","), ...rows.map((row) => keys.map((key) => escape(row?.[key])).join(","))].join("\n");
  return {
    filename: `${baseName(file.name)}.csv`,
    blob: new Blob([csv], { type: "text/csv;charset=utf-8" }),
    note: `${rows.length} records · ${keys.length} columns`,
  };
}

/* ------------------------------------------------------------------ images */

function readImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That image could not be read."));
    };
    image.src = url;
  });
}

export async function imageToPdf(file: File): Promise<ConvertResult> {
  const image = await readImage(file);
  const landscape = image.width > image.height;
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: landscape ? "landscape" : "portrait" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const scale = Math.min((pageWidth - margin * 2) / image.width, (pageHeight - margin * 2) / image.height);
  const width = image.width * scale;
  const height = image.height * scale;

  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext("2d")?.drawImage(image, 0, 0);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);

  pdf.addImage(dataUrl, "JPEG", (pageWidth - width) / 2, (pageHeight - height) / 2, width, height);
  return {
    filename: `${baseName(file.name)}.pdf`,
    blob: pdf.output("blob"),
    note: `${image.width}×${image.height} px`,
  };
}

export async function imageToText(file: File, onProgress?: (text: string) => void): Promise<ConvertResult> {
  onProgress?.("Loading the text recognition engine…");
  const { default: Tesseract } = await import("tesseract.js");
  const { data } = await Tesseract.recognize(file, "eng", {
    logger: (message: { status?: string; progress?: number }) => {
      if (message.status) onProgress?.(`${message.status} ${Math.round((message.progress ?? 0) * 100)}%`);
    },
  } as never);
  const text = (data.text ?? "").trim() || "No readable text was found in this image.";
  return {
    filename: `${baseName(file.name)}.txt`,
    blob: new Blob([text], { type: "text/plain;charset=utf-8" }),
    note: `${text.split(/\s+/).filter(Boolean).length} words recognised`,
  };
}

/* ------------------------------------------------------------------ routing */

export type ConversionId =
  | "pdf-docx"
  | "pdf-txt"
  | "csv-xlsx"
  | "csv-json"
  | "xlsx-csv"
  | "json-csv"
  | "image-pdf"
  | "image-txt";

export const CONVERSIONS: {
  id: ConversionId;
  label: string;
  accept: string;
  match: (name: string) => boolean;
  run: (file: File, onProgress?: (text: string) => void) => Promise<ConvertResult>;
}[] = [
  { id: "pdf-docx", label: "PDF → Word", accept: ".pdf", match: (n) => n.endsWith(".pdf"), run: pdfToDocx },
  { id: "pdf-txt", label: "PDF → Text", accept: ".pdf", match: (n) => n.endsWith(".pdf"), run: pdfToTxt },
  { id: "csv-xlsx", label: "CSV → Excel", accept: ".csv,.tsv,.txt", match: (n) => /\.(csv|tsv|txt)$/.test(n), run: csvToXlsx },
  { id: "csv-json", label: "CSV → JSON", accept: ".csv,.tsv,.txt", match: (n) => /\.(csv|tsv|txt)$/.test(n), run: csvToJson },
  { id: "xlsx-csv", label: "Excel → CSV", accept: ".xlsx,.xls", match: (n) => /\.(xlsx|xls)$/.test(n), run: xlsxToCsv },
  { id: "json-csv", label: "JSON → CSV", accept: ".json", match: (n) => n.endsWith(".json"), run: jsonToCsv },
  { id: "image-pdf", label: "Image → PDF", accept: "image/*", match: (n) => /\.(png|jpe?g|webp|gif|bmp)$/.test(n), run: imageToPdf },
  { id: "image-txt", label: "Image → Text (OCR)", accept: "image/*", match: (n) => /\.(png|jpe?g|webp|bmp)$/.test(n), run: imageToText },
];

export const suggestConversions = (name: string) =>
  CONVERSIONS.filter((conversion) => conversion.match(name.toLowerCase()));
