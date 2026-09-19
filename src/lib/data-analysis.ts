import {
  linearRegression,
  linearRegressionLine,
  max,
  mean,
  median,
  min,
  quantile,
  rSquared,
  sampleCorrelation,
  sampleStandardDeviation,
  sum,
  tTest,
  tTestTwoSample,
} from "simple-statistics";

export type CellValue = string | number | boolean | null;
export type DataRow = Record<string, CellValue>;

export type ColumnProfile = {
  name: string;
  type: "numeric" | "text";
  count: number;
  missing: number;
  unique: number;
  mean?: number;
  median?: number;
  standardDeviation?: number;
  minimum?: number;
  q1?: number;
  q3?: number;
  maximum?: number;
};

export function normalizeRows(input: unknown[][]): DataRow[] {
  const width = Math.max(0, ...input.map((row) => row.length));
  if (!width) return [];
  const first = input[0] ?? [];
  const headers = Array.from({ length: width }, (_, index) => {
    const raw = String(first[index] ?? "").trim();
    return raw || `Column ${index + 1}`;
  });
  const uniqueHeaders = headers.map((header, index) => {
    const duplicate = headers.slice(0, index).filter((value) => value === header).length;
    return duplicate ? `${header} ${duplicate + 1}` : header;
  });
  return input.slice(1).filter((row) => row.some((value) => value !== "" && value != null)).map((row) =>
    Object.fromEntries(uniqueHeaders.map((header, index) => [header, normalizeCell(row[index])])),
  );
}

function normalizeCell(value: unknown): CellValue {
  if (value === "" || value == null) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  const text = String(value).trim();
  if (!text) return null;
  const numeric = Number(text.replace(/,/g, ""));
  return Number.isFinite(numeric) && /^[-+]?[$€£]?[\d,.]+%?$/.test(text)
    ? text.endsWith("%") ? numeric / 100 : numeric
    : text;
}

export function numericValues(rows: DataRow[], column: string) {
  return rows.map((row) => row[column]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

export function profileData(rows: DataRow[]): ColumnProfile[] {
  const columns = Object.keys(rows[0] ?? {});
  return columns.map((name) => {
    const present = rows.map((row) => row[name]).filter((value) => value !== null && value !== "");
    const values = numericValues(rows, name);
    const base = { name, type: values.length >= present.length * 0.8 && values.length ? "numeric" as const : "text" as const, count: present.length, missing: rows.length - present.length, unique: new Set(present.map(String)).size };
    if (base.type === "text" || values.length === 0) return base;
    return {
      ...base,
      mean: mean(values), median: median(values), standardDeviation: values.length > 1 ? sampleStandardDeviation(values) : 0,
      minimum: min(values), q1: quantile(values, 0.25), q3: quantile(values, 0.75), maximum: max(values),
    };
  });
}

export function pairedValues(rows: DataRow[], x: string, y: string) {
  return rows.flatMap((row) => {
    const xv = row[x]; const yv = row[y];
    return typeof xv === "number" && typeof yv === "number" ? [[xv, yv] as [number, number]] : [];
  });
}

export function correlation(rows: DataRow[], x: string, y: string) {
  const pairs = pairedValues(rows, x, y);
  if (pairs.length < 2) return null;
  return sampleCorrelation(pairs.map(([value]) => value), pairs.map(([, value]) => value));
}

export function regression(rows: DataRow[], x: string, y: string) {
  const pairs = pairedValues(rows, x, y);
  if (pairs.length < 2) return null;
  const model = linearRegression(pairs);
  const line = linearRegressionLine(model);
  return { ...model, r2: rSquared(pairs, line), count: pairs.length };
}

export function runTTest(rows: DataRow[], valueColumn: string, groupColumn: string, expected: number) {
  const values = numericValues(rows, valueColumn);
  if (!groupColumn) return values.length > 1 ? { label: `One-sample t-test against ${expected}`, statistic: tTest(values, expected), groups: `${values.length} observations` } : null;
  const groups = [...new Set(rows.map((row) => String(row[groupColumn] ?? "")).filter(Boolean))].slice(0, 2);
  if (groups.length < 2) return null;
  const a = rows.filter((row) => String(row[groupColumn] ?? "") === groups[0]).map((row) => row[valueColumn]).filter((value): value is number => typeof value === "number");
  const b = rows.filter((row) => String(row[groupColumn] ?? "") === groups[1]).map((row) => row[valueColumn]).filter((value): value is number => typeof value === "number");
  if (a.length < 2 || b.length < 2) return null;
  return { label: "Two-sample t-test", statistic: tTestTwoSample(a, b, 0), groups: `${groups[0]} (n=${a.length}) vs ${groups[1]} (n=${b.length})` };
}

export function histogram(values: number[], bins = 10) {
  if (!values.length) return [];
  const low = min(values); const high = max(values); const width = (high - low || 1) / bins;
  const counts = Array.from({ length: bins }, () => 0);
  values.forEach((value) => {
    const index = Math.min(bins - 1, Math.floor((value - low) / width));
    counts[index] = (counts[index] ?? 0) + 1;
  });
  return counts.map((count, index) => ({ bin: `${formatNumber(low + index * width)}–${formatNumber(low + (index + 1) * width)}`, count }));
}

export function formatNumber(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return Math.abs(value) >= 1000 ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : value.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

export function datasetSummary(rows: DataRow[], profiles: ColumnProfile[]) {
  return { rows: rows.length, columns: profiles.length, missing: sum(profiles.map((profile) => profile.missing)), numericColumns: profiles.filter((profile) => profile.type === "numeric").map((profile) => ({ name: profile.name, mean: profile.mean, median: profile.median, minimum: profile.minimum, maximum: profile.maximum })) };
}