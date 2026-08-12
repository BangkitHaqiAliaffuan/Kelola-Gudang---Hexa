import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState, TableSkeleton } from "./kit";

export type Column<T> = {
  key: string;
  label: string;
  className?: string;
  sticky?: "left" | "right";
  sortable?: boolean;
  sortAccessor?: (row: T) => unknown;
  render: (row: T) => ReactNode;
};

type SortState = { key: string; dir: "asc" | "desc" };

function sortValue(row: unknown, key: string): unknown {
  return (row as Record<string, unknown>)[key];
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""), "id");
}

export function DataTable<T extends { id: string | number }>({
  columns,
  rows,
  mobileCard,
  pageSize = 10,
  loading = false,
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[];
  mobileCard: (row: T) => ReactNode;
  pageSize?: number;
  loading?: boolean;
  onRowClick?: (row: T) => void;
}) {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState | null>(null);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, totalPages);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const { key, dir } = sort;
    const col = columns.find((c) => c.key === key);
    const get = col?.sortAccessor ?? ((r: T) => sortValue(r, key));
    return [...rows].sort((a, b) => {
      const cmp = compare(get(a), get(b));
      return dir === "asc" ? cmp : -cmp;
    });
  }, [rows, sort, columns]);
  const slice = sorted.slice((current - 1) * pageSize, current * pageSize);

  const toggleSort = (key: string) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
    setPage(1);
  };

  const SortIcon = ({ colKey }: { colKey: string }) => {
    const active = sort?.key === colKey;
    if (!active) return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground opacity-60" />;
    return sort.dir === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5 text-primary" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-primary" />
    );
  };

  if (loading) return <TableSkeleton rows={pageSize} cols={Math.min(columns.length, 6)} />;
  if (!rows.length)
    return (
      <EmptyState
        title="Data tidak ditemukan"
        description="Coba ubah kata kunci pencarian atau filter yang dipakai."
      />
    );

  return (
    <div className="space-y-4">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    "sticky top-0 whitespace-nowrap border-b border-border bg-muted/50 px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground first:rounded-tl-xl last:rounded-tr-xl",
                    c.sticky === "right" && "right-0 z-10 bg-muted",
                    c.sticky === "left" && "left-0 z-10 bg-muted",
                    c.className,
                  )}
                >
                  {c.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className="inline-flex items-center gap-1.5 select-none"
                      aria-label={`Urutkan berdasarkan ${c.label}`}
                    >
                      {c.label}
                      <SortIcon colKey={c.key} />
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((row) => (
              <tr
                key={row.id}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  "group transition-colors hover:bg-accent/40",
                  onRowClick && "cursor-pointer",
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "border-b border-border/70 px-3 py-2.5 align-middle",
                      c.sticky === "right" &&
                        "sticky right-0 z-10 border-l bg-card group-hover:bg-accent/40",
                      c.sticky === "left" &&
                        "sticky left-0 z-10 border-r bg-card group-hover:bg-accent/40",
                      c.className,
                    )}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {slice.map((row) => (
          <div
            key={row.id}
            onClick={() => onRowClick?.(row)}
            className="rounded-xl border border-border bg-card p-3.5 shadow-soft transition-colors active:bg-accent/40"
          >
            {mobileCard(row)}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <p className="truncate text-xs text-muted-foreground">
          Menampilkan {(current - 1) * pageSize + 1}–{Math.min(current * pageSize, rows.length)}{" "}
          dari {rows.length.toLocaleString("id-ID")} data
        </p>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-lg"
            disabled={current === 1}
            onClick={() => setPage(current - 1)}
            aria-label="Sebelumnya"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-1 text-xs font-medium">
            {current} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-lg"
            disabled={current === totalPages}
            onClick={() => setPage(current + 1)}
            aria-label="Berikutnya"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
