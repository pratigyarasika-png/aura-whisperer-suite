/** Dataset preview grid with per-column cleaning controls. */

import { ArrowDownUp, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  changeColumnType,
  dropColumn,
  dropMissing,
  filterRows,
  renameColumn,
  type ColumnType,
  type Dataset,
  type FilterOp,
} from "@/lib/dataset";

const TYPES: ColumnType[] = ["number", "string", "boolean", "date"];
const OPS: { id: FilterOp; label: string }[] = [
  { id: "equals", label: "equals" },
  { id: "contains", label: "contains" },
  { id: "gt", label: "greater than" },
  { id: "lt", label: "less than" },
  { id: "not-empty", label: "is not empty" },
];

type Props = {
  dataset: Dataset;
  onChange: (dataset: Dataset) => void;
};

export function DataGridPanel({ dataset, onChange }: Props) {
  const [column, setColumn] = useState(dataset.columns[0]?.name ?? "");
  const [op, setOp] = useState<FilterOp>("not-empty");
  const [value, setValue] = useState("");
  const [rename, setRename] = useState("");

  const active = dataset.columns.some((c) => c.name === column)
    ? column
    : (dataset.columns[0]?.name ?? "");
  const activeType = dataset.columns.find((c) => c.name === active)?.type ?? "string";
  const preview = dataset.rows.slice(0, 50);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
        <select
          value={active}
          onChange={(event) => setColumn(event.target.value)}
          aria-label="Column to clean"
          className="h-9 min-w-36 rounded-full border border-input bg-background px-3 text-xs"
        >
          {dataset.columns.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={activeType}
          onChange={(event) =>
            onChange(changeColumnType(dataset, active, event.target.value as ColumnType))
          }
          aria-label="Column data type"
          className="h-9 rounded-full border border-input bg-background px-3 text-xs"
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <input
          value={rename}
          onChange={(event) => setRename(event.target.value)}
          placeholder="rename to…"
          aria-label="New column name"
          className="h-9 w-36 rounded-full border border-input bg-background px-3 text-xs outline-none"
        />
        <Button
          size="sm"
          variant="secondary"
          className="h-9 rounded-full text-xs"
          disabled={!rename.trim()}
          onClick={() => {
            onChange(renameColumn(dataset, active, rename));
            setRename("");
          }}
        >
          Rename
        </Button>

        <Button
          size="sm"
          variant="secondary"
          className="h-9 rounded-full text-xs"
          onClick={() => onChange(dropMissing(dataset, active))}
        >
          Drop missing
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="h-9 rounded-full text-xs"
          onClick={() => onChange(dropMissing(dataset))}
        >
          Drop incomplete rows
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-9 rounded-full text-xs text-destructive"
          onClick={() => onChange(dropColumn(dataset, active))}
        >
          <Trash2 className="mr-1 size-3.5" /> Drop column
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
        <span className="flex items-center gap-1 text-[11px] font-semibold uppercase text-muted-foreground">
          <ArrowDownUp className="size-3.5" /> Filter rows
        </span>
        <select
          value={op}
          onChange={(event) => setOp(event.target.value as FilterOp)}
          aria-label="Filter comparison"
          className="h-9 rounded-full border border-input bg-background px-3 text-xs"
        >
          {OPS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        {op !== "not-empty" && (
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="value"
            aria-label="Filter value"
            className="h-9 w-32 rounded-full border border-input bg-background px-3 text-xs outline-none"
          />
        )}
        <Button
          size="sm"
          className="h-9 rounded-full text-xs"
          onClick={() => onChange(filterRows(dataset, active, op, value))}
        >
          Apply filter
        </Button>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {dataset.rows.length.toLocaleString()} rows × {dataset.columns.length} columns
        </span>
      </div>

      <div className="max-h-[420px] overflow-auto rounded-2xl border border-border">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 bg-muted">
            <tr>
              {dataset.columns.map((c) => (
                <th key={c.name} className="whitespace-nowrap border-b border-border px-3 py-2 font-semibold">
                  {c.name}
                  <span className="ml-1 font-normal text-muted-foreground">{c.type}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((row, i) => (
              <tr key={i} className="odd:bg-muted/30">
                {dataset.columns.map((c) => (
                  <td key={c.name} className="max-w-56 truncate border-b border-border px-3 py-1.5">
                    {row[c.name] === null || row[c.name] === "" ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      String(row[c.name])
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dataset.rows.length > preview.length && (
        <p className="text-[11px] text-muted-foreground">
          Showing the first {preview.length} of {dataset.rows.length.toLocaleString()} rows.
        </p>
      )}
    </div>
  );
}
