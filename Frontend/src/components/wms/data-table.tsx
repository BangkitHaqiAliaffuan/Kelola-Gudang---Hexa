import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState, TableSkeleton } from "./kit";

export type Column<T> = {
  key: string;
  label: string;
  className?: string;
  sticky?: "left" | "right";
  render: (row: T) => ReactNode;
};

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
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, totalPages);
  const slice = rows.slice((current - 1) * pageSize, current * pageSize);

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
                  {c.label}
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
