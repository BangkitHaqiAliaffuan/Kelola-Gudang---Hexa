import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Download, Plus, Search, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { ALL, FilterSelect, PageHeader, Panel, Pill, StatCard, type Tone } from "./kit";
import { DataTable, type Column } from "./data-table";
import { PurchaseOrderSheet } from "./purchase-order-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useAuth } from "@/hooks/use-auth";
import { useSuppliers, useWarehouses } from "@/hooks/use-master";
import { useProcDocPo, useProcDocsPo } from "@/hooks/use-purchase-order";
import { formatDate, formatIDR, formatNumber } from "@/lib/wms-data";
import { downloadCsv, toCsv } from "@/lib/csv";
import { poStatuses, type ProcDocApi } from "@/lib/purchase-order-types";

const statusTone = (s: string): Tone =>
  s === "Selesai" || s === "Disetujui"
    ? "success"
    : s === "Ditolak" || s === "Dibatalkan"
      ? "danger"
      : s === "Draft"
        ? "neutral"
        : s === "Sebagian Diterima"
          ? "info"
          : "warning";

export function PurchaseOrderPage() {
  const { hasModuleLevel, user } = useAuth();
  const canWrite = hasModuleLevel("Pengadaan", "Tulis");
  const { data, isLoading } = useProcDocsPo("PO");
  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const { data: suppliers, isLoading: suppliersLoading } = useSuppliers();

  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [status, setStatus] = useState(ALL);
  const [wh, setWh] = useState(ALL);
  const [supplier, setSupplier] = useState(ALL);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: detail } = useProcDocPo(selectedId ?? undefined);

  const qn = debouncedQ.trim().toLowerCase().replace(/\s+/g, " ");

  const rows = useMemo(
    () =>
      (data?.data ?? []).filter(
        (d) =>
          (!qn ||
            [d.no, d.supplier, d.reference, d.department, d.requester]
              .join(" ")
              .toLowerCase()
              .includes(qn)) &&
          (status === ALL || d.status === status) &&
          (wh === ALL || d.warehouse === wh) &&
          (supplier === ALL || d.supplier === supplier),
      ),
    [data, qn, status, wh, supplier],
  );

  const totalValue = rows.reduce((a, b) => a + (b.value_total ?? 0), 0);
  const mineAwaiting = rows.filter(
    (d) => d.status === "Menunggu Approval" && d.approver_user_id === user?.id,
  ).length;
  const openDocs = rows.filter(
    (d) => d.status === "Menunggu Approval" || d.status === "Sebagian Diterima",
  ).length;
  const doneDocs = rows.filter((d) => d.status === "Selesai" || d.status === "Disetujui").length;

  const columns: Column<ProcDocApi>[] = [
    {
      key: "no",
      label: "Nomor",
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
      key: "supplier",
      label: "Supplier",
      className: "min-w-[160px] whitespace-nowrap",
      sortable: true,
      render: (r) => r.supplier ?? "—",
    },
    {
      key: "reference",
      label: "No. PR",
      className: "min-w-[120px] whitespace-nowrap",
      sortable: true,
      render: (r) => r.reference ?? "—",
    },
    {
      key: "department",
      label: "Departemen",
      className: "min-w-[140px] whitespace-nowrap",
      sortable: true,
      render: (r) => r.department ?? "—",
    },
    {
      key: "qty_total",
      label: "Qty",
      className: "text-right w-[90px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => r.qty_total ?? 0,
      render: (r) => formatNumber(r.qty_total ?? 0),
    },
    {
      key: "value_total",
      label: "Nilai",
      className: "text-right w-[130px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => r.value_total ?? 0,
      render: (r) => <span className="font-semibold">{formatIDR(r.value_total ?? 0)}</span>,
    },
    {
      key: "status",
      label: "Status",
      className: "w-[150px] whitespace-nowrap",
      sortable: true,
      render: (r) => <Pill tone={statusTone(r.status)}>{r.status}</Pill>,
    },
  ];

  const exportCsv = () => {
    downloadCsv(
      "purchase-order.csv",
      toCsv(
        rows.map((r) => ({
          no: r.no,
          tanggal: r.document_date ?? "",
          supplier: r.supplier ?? "",
          reference: r.reference ?? "",
          departemen: r.department ?? "",
          qty: r.qty_total ?? 0,
          nilai: r.value_total ?? 0,
          status: r.status,
        })),
        [
          { key: "no", label: "Nomor" },
          { key: "tanggal", label: "Tanggal" },
          { key: "supplier", label: "Supplier" },
          { key: "reference", label: "No. PR" },
          { key: "departemen", label: "Departemen" },
          { key: "qty", label: "Qty" },
          { key: "nilai", label: "Nilai" },
          { key: "status", label: "Status" },
        ],
      ),
    );
    toast.success("Data Purchase Order diekspor ke CSV");
  };

  return (
    <>
      <PageHeader
        title="Purchase Order"
        description="Pesanan pembelian resmi ke supplier"
        actions={
          <>
            <Button variant="outline" className="rounded-xl" onClick={exportCsv}>
              <Download className="h-4 w-4" />
              Export
            </Button>
            {canWrite && (
              <Button asChild className="rounded-xl">
                <Link to="/pengadaan/purchase-order/new">
                  <Plus className="h-4 w-4" /> Buat Purchase Order
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Total Dokumen" value={formatNumber(rows.length)} icon={ShoppingCart} />
        <StatCard
          label="Menunggu Saya"
          value={formatNumber(mineAwaiting)}
          icon={ShoppingCart}
          tone="brand"
        />
        <StatCard
          label="Perlu Tindakan"
          value={formatNumber(openDocs)}
          icon={ShoppingCart}
          tone="warning"
        />
        <StatCard
          label="Selesai / Disetujui"
          value={formatNumber(doneDocs)}
          icon={ShoppingCart}
          tone="success"
        />
        <StatCard
          label="Nilai Total"
          value={formatIDR(totalValue)}
          icon={ShoppingCart}
          tone="info"
        />
      </div>

      <Panel title="Filter">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari nomor, supplier, No. PR, departemen..."
              className="rounded-xl pl-9"
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
            value={supplier}
            onChange={setSupplier}
            placeholder="Semua Supplier"
            options={suppliers?.data.map((s) => s.name) ?? []}
            loading={suppliersLoading}
          />
          <FilterSelect
            className="w-full"
            value={status}
            onChange={setStatus}
            placeholder="Semua Status"
            options={[...poStatuses]}
          />
        </div>
      </Panel>

      <Panel title="Daftar Purchase Order" description="Klik baris untuk melihat detail">
        <DataTable
          columns={columns}
          rows={rows}
          pageSize={12}
          loading={isLoading}
          onRowClick={(r) => setSelectedId(r.id)}
          initialSort={{ key: "document_date", dir: "desc" }}
          mobileCard={(r) => (
            <div className="space-y-1.5">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <p className="truncate font-mono text-sm font-semibold">{r.no}</p>
                <Pill tone={statusTone(r.status)}>{r.status}</Pill>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {formatDate(r.document_date)} · {r.supplier ?? "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                No. PR: {r.reference ?? "—"} · {formatNumber(r.qty_total ?? 0)} qty
              </p>
              <p className="text-sm font-semibold">{formatIDR(r.value_total ?? 0)}</p>
            </div>
          )}
        />
      </Panel>

      <PurchaseOrderSheet
        doc={detail?.data ?? null}
        onOpenChange={(o) => !o && setSelectedId(null)}
      />
    </>
  );
}
