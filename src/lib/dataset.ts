/** Dataset model, parsers, cleaning operations and descriptive statistics. */

export type ColumnType = "number" | "string" | "boolean" | "date";

export type DatasetColumn = {
  name: string;
  type: ColumnType;
};

export type DataRow = Record<string, string | number | boolean | null>;

export type Dataset = {
  id: string;
  name: string;
  source: string;
  columns: DatasetColumn[];
  rows: DataRow[];
  createdAt: number;
  notes?: string;
};

export const makeId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/* ------------------------------------------------------------------ parsing */

/** RFC4180-ish delimited text parser (handles quotes, escaped quotes, CRLF). */
export function parseDelimited(text: string, delimiter?: string): string[][] {
  const sample = text.slice(0, 5000);
  const delim =
    delimiter ??
    ([",", "\t", ";", "|"]
      .map((d) => ({ d, n: sample.split(d).length }))
      .sort((a, b) => b.n - a.n)[0]?.d ??
      ",");

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === delim) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/;

function inferType(values: string[]): ColumnType {
  const present = values.filter((v) => v !== "" && v != null);
  if (!present.length) return "string";
  if (present.every((v) => /^(true|false|yes|no)$/i.test(v.trim()))) return "boolean";
  if (
    present.every((v) => {
      const cleaned = v.replace(/[,\s%$]/g, "");
      return cleaned !== "" && Number.isFinite(Number(cleaned));
    })
  )
    return "number";
  if (present.every((v) => DATE_RE.test(v.trim()))) return "date";
  return "string";
}

export function coerce(value: unknown, type: ColumnType): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (raw === "" || raw.toLowerCase() === "na" || raw.toLowerCase() === "null") return null;
  if (type === "number") {
    const n = Number(raw.replace(/[,\s%$]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  if (type === "boolean") return /^(true|yes|1)$/i.test(raw);
  return raw;
}

/** Turn a matrix (first row = header) into a typed dataset. */
export function datasetFromMatrix(matrix: string[][], name: string, source: string): Dataset {
  const [headerRow = [], ...body] = matrix;
  const used = new Set<string>();
  const headers = headerRow.map((h, i) => {
    let base = (h ?? "").trim() || `column_${i + 1}`;
    while (used.has(base)) base = `${base}_${i + 1}`;
    used.add(base);
    return base;
  });

  const columns: DatasetColumn[] = headers.map((h, i) => ({
    name: h,
    type: inferType(body.map((r) => (r[i] ?? "").trim())),
  }));

  const rows: DataRow[] = body.map((r) => {
    const row: DataRow = {};
    columns.forEach((col, i) => {
      row[col.name] = coerce(r[i], col.type);
    });
    return row;
  });

  return { id: makeId(), name, source, columns, rows, createdAt: Date.now() };
}

export async function parseCsvFile(file: File): Promise<Dataset> {
  const text = await file.text();
  return datasetFromMatrix(parseDelimited(text), file.name, "CSV upload");
}

export async function parseXlsxFile(file: File): Promise<Dataset[]> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const book = XLSX.read(buffer, { type: "array" });
  return book.SheetNames.map((sheetName) => {
    const sheet = book.Sheets[sheetName]!;
    const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
    }) as unknown as string[][];
    const clean = matrix.filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
    return datasetFromMatrix(
      clean,
      book.SheetNames.length > 1 ? `${file.name} — ${sheetName}` : file.name,
      "Spreadsheet upload",
    );
  }).filter((d) => d.columns.length > 0);
}

export type PdfExtraction = {
  text: string;
  pageCount: number;
  tables: Dataset[];
  figures: string[];
};

/** Extract text, whitespace-aligned tables and rendered figures from a PDF. */
export async function parsePdfFile(file: File): Promise<PdfExtraction> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  const figures: string[] = [];

  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const lines = new Map<number, { x: number; str: string }[]>();
    for (const item of content.items as Array<{ str: string; transform: number[] }>) {
      if (!item.str?.trim()) continue;
      const y = Math.round(item.transform[5] ?? 0);
      const x = item.transform[4] ?? 0;
      const bucket = lines.get(y) ?? [];
      bucket.push({ x, str: item.str });
      lines.set(y, bucket);
    }
    const ordered = [...lines.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, parts]) =>
        parts
          .sort((a, b) => a.x - b.x)
          .map((part, i, arr) => {
            const prev = arr[i - 1];
            const gap = prev ? part.x - prev.x : 0;
            return (i > 0 && gap > 40 ? "\t" : "") + part.str;
          })
          .join("")
          .replace(/\s+\t/g, "\t"),
      );
    pages.push(ordered.join("\n"));

    if (figures.length < 4) {
      const viewport = page.getViewport({ scale: 1.2 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.min(900, viewport.width);
      canvas.height = (canvas.width / viewport.width) * viewport.height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        await page.render({
          canvas,
          canvasContext: ctx,
          viewport: page.getViewport({ scale: canvas.width / viewport.width * 1.2 }),
        } as never).promise;
        figures.push(canvas.toDataURL("image/png"));
      }
    }
  }

  const text = pages.join("\n\n");
  return { text, pageCount: doc.numPages, tables: tablesFromText(text, file.name), figures };
}

/** Detect tab/multi-space aligned tables inside extracted text. */
export function tablesFromText(text: string, name: string): Dataset[] {
  const lines = text.split("\n");
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    const cells = line.split(/\t|\s{2,}/).filter((c) => c.trim() !== "");
    if (cells.length >= 2) {
      current.push(line);
    } else {
      if (current.length >= 3) blocks.push(current);
      current = [];
    }
  }
  if (current.length >= 3) blocks.push(current);

  return blocks.slice(0, 6).map((block, i) => {
    const matrix = block.map((line) => line.split(/\t|\s{2,}/).map((c) => c.trim()));
    const width = Math.max(...matrix.map((r) => r.length));
    const padded = matrix.map((r) => [...r, ...Array(width - r.length).fill("")]);
    return datasetFromMatrix(padded, `${name} — table ${i + 1}`, "PDF table");
  });
}

/* ----------------------------------------------------------------- cleaning */

export function dropMissing(dataset: Dataset, column?: string): Dataset {
  const rows = dataset.rows.filter((row) =>
    column
      ? row[column] !== null && row[column] !== ""
      : dataset.columns.every((c) => row[c.name] !== null && row[c.name] !== ""),
  );
  return { ...dataset, rows };
}

export function renameColumn(dataset: Dataset, from: string, to: string): Dataset {
  const target = to.trim();
  if (!target || target === from || dataset.columns.some((c) => c.name === target)) return dataset;
  return {
    ...dataset,
    columns: dataset.columns.map((c) => (c.name === from ? { ...c, name: target } : c)),
    rows: dataset.rows.map((row) => {
      const next: DataRow = {};
      for (const key of Object.keys(row)) next[key === from ? target : key] = row[key] ?? null;
      return next;
    }),
  };
}

export function dropColumn(dataset: Dataset, name: string): Dataset {
  return {
    ...dataset,
    columns: dataset.columns.filter((c) => c.name !== name),
    rows: dataset.rows.map((row) => {
      const next = { ...row };
      delete next[name];
      return next;
    }),
  };
}

export function changeColumnType(dataset: Dataset, name: string, type: ColumnType): Dataset {
  return {
    ...dataset,
    columns: dataset.columns.map((c) => (c.name === name ? { ...c, type } : c)),
    rows: dataset.rows.map((row) => ({ ...row, [name]: coerce(row[name], type) })),
  };
}

export type FilterOp = "equals" | "contains" | "gt" | "lt" | "not-empty";

export function filterRows(
  dataset: Dataset,
  column: string,
  op: FilterOp,
  value: string,
): Dataset {
  const rows = dataset.rows.filter((row) => {
    const cell = row[column];
    if (op === "not-empty") return cell !== null && cell !== "";
    if (cell === null) return false;
    if (op === "equals") return String(cell).toLowerCase() === value.trim().toLowerCase();
    if (op === "contains") return String(cell).toLowerCase().includes(value.trim().toLowerCase());
    const n = Number(cell);
    const target = Number(value);
    if (!Number.isFinite(n) || !Number.isFinite(target)) return false;
    return op === "gt" ? n > target : n < target;
  });
  return { ...dataset, rows };
}

/* --------------------------------------------------------------- statistics */

export type ColumnStats = {
  column: string;
  count: number;
  missing: number;
  mean: number;
  median: number;
  std: number;
  min: number;
  max: number;
};

export const numericColumns = (dataset: Dataset) =>
  dataset.columns.filter((c) => c.type === "number").map((c) => c.name);

export const columnValues = (dataset: Dataset, column: string) =>
  dataset.rows
    .map((row) => Number(row[column]))
    .filter((n): n is number => Number.isFinite(n));

export function describe(dataset: Dataset): ColumnStats[] {
  return numericColumns(dataset).map((column) => {
    const values = columnValues(dataset, column);
    const n = values.length;
    const mean = n ? values.reduce((a, b) => a + b, 0) / n : 0;
    const variance = n > 1 ? values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(n / 2);
    return {
      column,
      count: n,
      missing: dataset.rows.length - n,
      mean,
      median: n ? (n % 2 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2) : 0,
      std: Math.sqrt(variance),
      min: n ? (sorted[0] as number) : 0,
      max: n ? (sorted[n - 1] as number) : 0,
    };
  });
}

export function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const xs = a.slice(0, n);
  const ys = b.slice(0, n);
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    const vx = (xs[i] as number) - mx;
    const vy = (ys[i] as number) - my;
    num += vx * vy;
    dx += vx * vx;
    dy += vy * vy;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}

export function correlationMatrix(dataset: Dataset) {
  const cols = numericColumns(dataset);
  const series = new Map(cols.map((c) => [c, columnValues(dataset, c)]));
  return {
    columns: cols,
    values: cols.map((rowCol) =>
      cols.map((col) => pearson(series.get(rowCol) ?? [], series.get(col) ?? [])),
    ),
  };
}

export function histogram(values: number[], bins = 12) {
  if (!values.length) return [] as { bin: string; count: number }[];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = (max - min) / bins || 1;
  const counts = Array.from({ length: bins }, () => 0);
  for (const v of values) {
    const idx = Math.min(bins - 1, Math.floor((v - min) / width));
    counts[idx] = (counts[idx] ?? 0) + 1;
  }
  return counts.map((count, i) => ({
    bin: `${(min + i * width).toFixed(1)}`,
    count,
  }));
}

/* ------------------------------------------------------------------ exports */

export function datasetToCsv(dataset: Dataset): string {
  const escape = (value: unknown) => {
    const raw = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
  };
  const header = dataset.columns.map((c) => escape(c.name)).join(",");
  const body = dataset.rows.map((row) =>
    dataset.columns.map((c) => escape(row[c.name])).join(","),
  );
  return [header, ...body].join("\n");
}

export function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function datasetSummaryForAi(dataset: Dataset, sampleRows = 12) {
  return {
    name: dataset.name,
    rowCount: dataset.rows.length,
    columns: dataset.columns,
    stats: describe(dataset),
    sample: dataset.rows.slice(0, sampleRows),
  };
}
