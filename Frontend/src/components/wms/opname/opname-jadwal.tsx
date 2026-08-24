import { useMemo, useState } from "react";
import { CalendarDays, CheckCheck, ClipboardCheck, ListChecks, TriangleAlert } from "lucide-react";
import { ALL, FilterSelect, PageHeader, Panel, Pill, StatCard } from "@/components/wms/kit";
import { DataTable, type Column } from "@/components/wms/data-table";
import { StockDocumentSheet } from "@/components/wms/stock-document-sheet";
import { OpnameCreateDialog } from "@/components/wms/opname/opname-create-dialog";
import {
  opnameLabel,
  opnameLabelTone,
  useOpnameAnalytics,
} from "@/components/wms/opname/opname-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useAuth } from "@/hooks/use-auth";
import { useWarehouses } from "@/hooks/use-master";
import { useStockDocument, useStockDocuments } from "@/hooks/use-persediaan";
import { formatDate, formatNumber } from "@/lib/wms-data";
import { buildStockDocumentSearchText } from "@/lib/stock-document-search";
import type { StockDocumentApi } from "@/lib/persediaan-types";

export function OpnameJadwalPage() {
  const { hasModuleLevel } = useAuth();
  const canWrite = hasModuleLevel("Persediaan", "Tulis");
  const { data, isLoading } = useStockDocuments({ type: "Stock Opname" });
  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();

  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [wh, setWh] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: detail, isLoading: detailLoading } = useStockDocument(selectedId ?? undefined);

  const sessions = useMemo(() => data?.data ?? [], [data]);
  const analytics = useOpnameAnalytics(sessions);

  const qn = debouncedQ.trim().toLowerCase().replace(/\s+/g, " ");
  const searchIndex = useMemo(
    () => new Map(sessions.map((s) => [s.id, buildStockDocumentSearchText(s)])),
    [sessions],
  );

  const rows = useMemo(
    () =>
      sessions.filter(
        (s) =>
          (!qn || searchIndex.get(s.id)!.includes(qn)) &&
          (wh === ALL || s.warehouse === wh) &&
          (status === ALL || opnameLabel(s) === status),
      ),
    [sessions, qn, searchIndex, wh, status],
  );

  const columns: Column<StockDocumentApi>[] = [
    {
      key: "no",
      label: "Kode",
      className: "w-[170px] whitespace-nowrap",
      sortable: true,
      render: (r) => <span className="font-mono text-xs font-semibold text-primary">{r.no}</span>,
    },
    {
      key: "document_date",
      label: "Tanggal",
      className: "w-[130px] whitespace-nowrap",
      sortable: true,
      render: (r) => formatDate(r.document_date),
    },
    {
      key: "warehouse",
      label: "Gudang",
      className: "min-w-[150px] whitespace-nowrap",
      sortable: true,
      render: (r) => r.warehouse ?? "—",
    },
    {
      key: "line_count",
      label: "SKU",
      className: "text-right w-[90px] whitespace-nowrap",
      sortable: true,
      render: (r) => formatNumber(r.line_count),
    },
    {
      key: "checked_count",
      label: "Tercatat",
      className: "text-right w-[90px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => r.checked_count ?? 0,
      render: (r) => formatNumber(r.checked_count ?? 0),
    },
    {
      key: "pic",
      label: "PIC",
      className: "min-w-[120px] whitespace-nowrap",
      sortable: true,
      render: (r) => r.pic ?? "—",
    },
    {
      key: "status",
      label: "Status",
      className: "w-[140px] whitespace-nowrap",
      sortable: true,
      render: (r) => <Pill tone={opnameLabelTone(opnameLabel(r))}>{opnameLabel(r)}</Pill>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Jadwal Opname"
        description="Rencana pelaksanaan dan status penyelesaian"
        actions={
          canWrite && (
            <Button className="rounded-xl" onClick={() => setCreateOpen(true)}>
              <CalendarDays className="h-4 w-4" /> Buat Jadwal
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Sedang Berjalan"
          value={isLoading ? "…" : formatNumber(analytics.running)}
          icon={ClipboardCheck}
          loading={isLoading}
        />
        <StatCard
          label="Belum Dicek"
          value={isLoading ? "…" : formatNumber(analytics.unchecked)}
          icon={ListChecks}
          tone="warning"
          loading={isLoading}
        />
        <StatCard
          label="Sudah Dicek"
          value={isLoading ? "…" : formatNumber(analytics.checked)}
          icon={CheckCheck}
          tone="success"
          loading={isLoading}
        />
        <StatCard
          label="Selisih"
          value={isLoading ? "…" : formatNumber(analytics.selisih)}
          icon={TriangleAlert}
          tone="danger"
          loading={isLoading}
        />
      </div>

      <Panel title="Filter">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div className="relative">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari kode, gudang, PIC, tanggal, status..."
              className="rounded-xl pl-4"
            />
          </div>
          <FilterSelect
            className="w-full"
            value={wh}
            onChange={setWh}
            placeholder="Semua Gudang"
            options={warehouses?.data.map((w) => w.name) ?? []}
            loading={warehousesLoading}
          />
          <FilterSelect
            className="w-full"
            value={status}
            onChange={setStatus}
            placeholder="Semua Status"
            options={["Dijadwalkan", "Berjalan", "Selesai", "Dibatalkan"]}
          />
        </div>
      </Panel>

      <Panel title="Jadwal Pelaksanaan" description={`${formatNumber(rows.length)} sesi`}>
        <DataTable
          columns={columns}
          rows={rows}
          pageSize={12}
          loading={isLoading}
          onRowClick={(r) => setSelectedId(r.id)}
          mobileCard={(r) => {
            const label = opnameLabel(r);
            return (
              <div className="space-y-1.5">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <p className="truncate font-mono text-sm font-semibold">{r.no}</p>
                  <Pill tone={opnameLabelTone(label)}>{label}</Pill>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {formatDate(r.document_date)} · {r.warehouse ?? "—"}
                </p>
                <div className="flex justify-between pt-1 text-xs">
                  <span>
                    {formatNumber(r.line_count)} SKU · {formatNumber(r.checked_count ?? 0)} tercatat
                  </span>
                  <span>PIC {r.pic ?? "—"}</span>
                </div>
              </div>
            );
          }}
        />
      </Panel>

      <OpnameCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <StockDocumentSheet
        doc={detail?.data ?? null}
        isLoading={detailLoading}
        onOpenChange={(o) => !o && setSelectedId(null)}
      />
    </>
  );
}
