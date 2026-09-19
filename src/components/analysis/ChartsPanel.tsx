/** Auto-generated Recharts visualisations with PNG/SVG export. */

import { Download, Image as ImageIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import {
  columnValues,
  correlationMatrix,
  histogram,
  numericColumns,
  type Dataset,
} from "@/lib/dataset";
import { cn } from "@/lib/utils";

type ChartKind = "bar" | "line" | "scatter" | "heatmap" | "histogram";

const KINDS: { id: ChartKind; label: string }[] = [
  { id: "bar", label: "Bar" },
  { id: "line", label: "Line" },
  { id: "scatter", label: "Scatter" },
  { id: "heatmap", label: "Correlation heatmap" },
  { id: "histogram", label: "Distribution" },
];

function svgFrom(container: HTMLElement | null) {
  return container?.querySelector("svg") ?? null;
}

function serialize(svg: SVGSVGElement) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const box = svg.getBoundingClientRect();
  clone.setAttribute("width", String(Math.round(box.width)));
  clone.setAttribute("height", String(Math.round(box.height)));
  return new XMLSerializer().serializeToString(clone);
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

type Props = { dataset: Dataset };

export function ChartsPanel({ dataset }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const heatmapRef = useRef<HTMLDivElement>(null);
  const numeric = useMemo(() => numericColumns(dataset), [dataset]);
  const categorical = useMemo(
    () => dataset.columns.filter((c) => c.type !== "number").map((c) => c.name),
    [dataset],
  );

  const [kind, setKind] = useState<ChartKind>(numeric.length > 1 ? "scatter" : "histogram");
  const [xCol, setXCol] = useState(categorical[0] ?? numeric[0] ?? "");
  const [yCol, setYCol] = useState(numeric[0] ?? "");

  const x = dataset.columns.some((c) => c.name === xCol) ? xCol : (dataset.columns[0]?.name ?? "");
  const y = numeric.includes(yCol) ? yCol : (numeric[0] ?? "");

  const rows = useMemo(
    () =>
      dataset.rows
        .slice(0, 400)
        .map((row) => ({ x: row[x] ?? "", y: Number(row[y]) }))
        .filter((point) => Number.isFinite(point.y)),
    [dataset, x, y],
  );

  const bins = useMemo(() => histogram(columnValues(dataset, y)), [dataset, y]);
  const corr = useMemo(() => correlationMatrix(dataset), [dataset]);

  const exportChart = (format: "png" | "svg") => {
    const svg = svgFrom(kind === "heatmap" ? heatmapRef.current : wrapRef.current);
    if (!svg) return;
    const markup = serialize(svg);
    const name = `${dataset.name.replace(/\W+/g, "-").toLowerCase()}-${kind}`;
    if (format === "svg") {
      saveBlob(new Blob([markup], { type: "image/svg+xml" }), `${name}.svg`);
      return;
    }
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.width * 2;
      canvas.height = image.height * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => blob && saveBlob(blob, `${name}.png`));
    };
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  };

  if (!dataset.columns.length) {
    return <p className="text-xs text-muted-foreground">Load a dataset to generate charts.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {KINDS.map((option) => (
          <button
            key={option.id}
            onClick={() => setKind(option.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors",
              kind === option.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {option.label}
          </button>
        ))}
        <span className="ml-auto flex gap-2">
          <Button size="sm" variant="secondary" className="h-8 rounded-full text-[11px]" onClick={() => exportChart("png")}>
            <ImageIcon className="mr-1 size-3.5" /> PNG
          </Button>
          <Button size="sm" variant="secondary" className="h-8 rounded-full text-[11px]" onClick={() => exportChart("svg")}>
            <Download className="mr-1 size-3.5" /> SVG
          </Button>
        </span>
      </div>

      {kind !== "heatmap" && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {kind !== "histogram" && (
            <label className="flex items-center gap-2">
              <span className="text-muted-foreground">X</span>
              <select
                value={x}
                onChange={(event) => setXCol(event.target.value)}
                className="h-8 rounded-full border border-input bg-background px-3"
              >
                {dataset.columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex items-center gap-2">
            <span className="text-muted-foreground">{kind === "histogram" ? "Column" : "Y"}</span>
            <select
              value={y}
              onChange={(event) => setYCol(event.target.value)}
              className="h-8 rounded-full border border-input bg-background px-3"
            >
              {numeric.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {!numeric.length && kind !== "heatmap" && (
        <p className="text-xs text-muted-foreground">
          This dataset has no numeric columns yet — change a column type in the Data tab.
        </p>
      )}

      {kind === "heatmap" ? (
        <div ref={heatmapRef} className="overflow-auto rounded-2xl border border-border bg-card p-4">
          {corr.columns.length ? (
            <svg
              width={Math.max(280, corr.columns.length * 74 + 120)}
              height={corr.columns.length * 42 + 120}
              role="img"
              aria-label="Correlation heatmap"
            >
              {corr.columns.map((rowName, r) => (
                <g key={rowName}>
                  <text x={112} y={r * 42 + 122} textAnchor="end" className="fill-foreground" fontSize={11}>
                    {rowName.slice(0, 16)}
                  </text>
                  {corr.columns.map((colName, c) => {
                    const v = corr.values[r]?.[c] ?? 0;
                    const intensity = Math.min(1, Math.abs(v));
                    const fill =
                      v >= 0
                        ? `rgba(37, 99, 235, ${0.12 + intensity * 0.8})`
                        : `rgba(220, 38, 38, ${0.12 + intensity * 0.8})`;
                    return (
                      <g key={colName}>
                        <rect x={120 + c * 74} y={r * 42 + 102} width={70} height={38} rx={6} fill={fill} />
                        <text
                          x={155 + c * 74}
                          y={r * 42 + 126}
                          textAnchor="middle"
                          fontSize={10}
                          fill={intensity > 0.6 ? "#ffffff" : "currentColor"}
                          className={intensity > 0.6 ? "" : "fill-foreground"}
                        >
                          {v.toFixed(2)}
                        </text>
                      </g>
                    );
                  })}
                </g>
              ))}
              {corr.columns.map((colName, c) => (
                <text
                  key={`h-${colName}`}
                  x={155 + c * 74}
                  y={92}
                  textAnchor="middle"
                  fontSize={11}
                  className="fill-foreground"
                >
                  {colName.slice(0, 12)}
                </text>
              ))}
            </svg>
          ) : (
            <p className="text-xs text-muted-foreground">Need at least two numeric columns.</p>
          )}
        </div>
      ) : (
        <div ref={wrapRef} className="h-[340px] rounded-2xl border border-border bg-card p-3">
          <ResponsiveContainer width="100%" height="100%">
            {kind === "bar" ? (
              <BarChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                <XAxis dataKey="x" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Bar dataKey="y" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]}>
                  {rows.map((_, i) => (
                    <Cell key={i} fill="hsl(var(--primary))" />
                  ))}
                </Bar>
              </BarChart>
            ) : kind === "line" ? (
              <LineChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                <XAxis dataKey="x" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Line type="monotone" dataKey="y" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
              </LineChart>
            ) : kind === "scatter" ? (
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                <XAxis dataKey="x" name={x} fontSize={11} />
                <YAxis dataKey="y" name={y} fontSize={11} />
                <Tooltip />
                <Scatter data={rows} fill="hsl(var(--primary))" />
              </ScatterChart>
            ) : (
              <BarChart data={bins}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                <XAxis dataKey="bin" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
