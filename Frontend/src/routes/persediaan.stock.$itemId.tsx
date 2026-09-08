import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Boxes, RefreshCw } from "lucide-react";
import { EmptyState, PageHeader, Panel, Pill, StatCard, type Tone } from "@/components/wms/kit";
import { DataTable, type Column } from "@/components/wms/data-table";
import { StockDocumentSheet } from "@/components/wms/stock-document-sheet";
import { Button } from "@/components/ui/button";
import { useItem } from "@/hooks/use-master";
import {
  useStockCard,
  useStockDocument,
  useStockLocations,
  useStockMinimum,
  useStockValuation,
} from "@/hooks/use-persediaan";
import type {
  StockMinimumApi,
  StockMinimumStatus,
  StockRowApi,
  StockValuationApi,
} from "@/lib/persediaan-types";
import { formatDate, formatIDR, formatIDRCompact, formatNumber } from "@/lib/wms-data";

export const Route = createFileRoute("/persediaan/stock/$itemId")({
  head: () => ({
    meta: [
      { title: "Detail Stock Barang — KelolaGudang" },
      {
        name: "description",
        content: "Lokasi stock per gudang, rak, dan bin beserta nilai dan pergerakan terakhir.",
      },
      { property: "og:title", content: "Detail Stock Barang — KelolaGudang" },
    ],
  }),
  component: StockDetail,
});

const locStatusTone: Record<StockRowApi["status"], Tone> = {
  Habis: "danger",
  Menipis: "warning",
  Overstock: "info",
  Normal: "success",
};

const minStatusTone: Record<StockMinimumStatus, Tone> = {
  Habis: "danger",
  Kritis: "danger",
  Menipis: "warning",
  Normal: "success",
};

const movingTone = (m: StockValuationApi["moving"]): Tone =>
  m === "Dead" ? "danger" : m === "Slow" ? "warning" : m === "Medium" ? "info" : "success";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium text-foreground" title={value}>
        {value}
      </p>
    </div>
  );
}

function StockDetail() {
  const { itemId } = Route.useParams();
  const navigate = useNavigate();
  const id = Number(itemId);
  const validId = Number.isInteger(id) && id > 0 ? id : undefined;

  const itemQ = useItem(validId);
  const locQ = useStockLocations(validId);
  const cardQ = useStockCard(validId, "FIFO", null);
  const valQ = useStockValuation({ search: itemQ.data?.data.sku ?? null });
  const minQ = useStockMinimum();
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const { data: docDetail, isLoading: docLoading } = useStockDocument(selectedDocId ?? undefined);

  const item = itemQ.data?.data;
  const locations = useMemo(() => locQ.data?.data ?? [], [locQ.data]);
  const totals = useMemo(
    () =>
      locations.reduce(
        (a, r) => ({
          stock: a.stock + r.stock,
          reserved: a.reserved + r.reserved,
          available: a.available + r.available,
          nilai: a.nilai + r.nilai,
        }),
        { stock: 0, reserved: 0, available: 0, nilai: 0 },
      ),
    [locations],
  );
  const unit = item?.unit ?? locations[0]?.unit ?? "pcs";

  const valuation = useMemo(
    () => (valQ.data?.data ?? []).find((r) => r.item_id === validId),
    [valQ.data, validId],
  );
  const minimum = useMemo(
    () => (minQ.data?.data ?? []).find((r) => r.item_id === validId),
    [minQ.data, validId],
  );
  const recentMoves = useMemo(
    () => (cardQ.data?.data.rows ?? []).slice(-10).reverse(),
    [cardQ.data],
  );

  const refreshing =
    itemQ.isFetching || locQ.isFetching || cardQ.isFetching || valQ.isFetching || minQ.isFetching;
  const handleRefresh = () => {
    void itemQ.refetch();
    void locQ.refetch();
    void cardQ.refetch();
    void valQ.refetch();
    void minQ.refetch();
  };

  const goToCard = (warehouseId?: number | null) =>
    void navigate({
      to: "/persediaan/kartu-stock",
      search:
        warehouseId != null
          ? { item_id: validId, warehouse_id: warehouseId }
          : { item_id: validId },
    });

  if (validId === undefined) {
    return (
      <div className="space-y-5">
        <BackHeader title="Detail Stock Barang" />
        <Panel>
          <EmptyState
            title="ID barang tidak valid"
            description="Periksa kembali tautan yang Anda buka."
            action={
              <Button variant="outline" className="rounded-xl" asChild>
                <Link to="/persediaan/stock">Kembali ke Stock Saat Ini</Link>
              </Button>
            }
          />
        </Panel>
      </div>
    );
  }

  if (itemQ.isError) {
    return (
      <div className="space-y-5">
        <BackHeader title="Detail Stock Barang" />
        <Panel>
          <EmptyState
            title="Barang tidak ditemukan"
            description="Barang mungkin sudah dihapus dari master data."
            action={
              <Button variant="outline" className="rounded-xl" asChild>
                <Link to="/persediaan/stock">Kembali ke Stock Saat Ini</Link>
              </Button>
            }
          />
        </Panel>
      </div>
    );
  }

  const locColumns: Column<StockRowApi>[] = [
    {
      key: "warehouse",
      label: "Gudang",
      className: "min-w-[140px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => r.warehouse ?? "",
      render: (r) => <span className="font-medium">{r.warehouse ?? "—"}</span>,
    },
    {
      key: "rack",
      label: "Rak",
      className: "w-[90px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => r.rack ?? "",
      render: (r) => r.rack ?? "Lantai",
    },
    {
      key: "bin",
      label: "Bin",
      className: "w-[90px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => r.bin ?? "",
      render: (r) => r.bin ?? "Lantai",
    },
    {
      key: "stock",
      label: "Stock",
      className: "text-right w-[110px] whitespace-nowrap",
      sortable: true,
      render: (r) => (
        <b>
          {formatNumber(r.stock)} {r.unit ?? ""}
        </b>
      ),
    },
    {
      key: "reserved",
      label: "Reserved",
      className: "text-right w-[110px] whitespace-nowrap",
      sortable: true,
      render: (r) => `${formatNumber(r.reserved)} ${r.unit ?? ""}`,
    },
    {
      key: "available",
      label: "Available",
      className: "text-right w-[110px] whitespace-nowrap",
      sortable: true,
      render: (r) => (
        <b>
          {formatNumber(r.available)} {r.unit ?? ""}
        </b>
      ),
    },
    {
      key: "avg",
      label: "HPP Avg",
      className: "text-right min-w-[120px] whitespace-nowrap",
      sortable: true,
      sortAccessor: (r) => r.unit_cost_avg,
      render: (r) => formatIDR(r.unit_cost_avg),
    },
    {
      key: "nilai",
      label: "Nilai",
      className: "text-right min-w-[130px] whitespace-nowrap",
      sortable: true,
      render: (r) => formatIDR(r.nilai),
    },
    {
      key: "status",
      label: "Status",
      className: "w-[100px] whitespace-nowrap",
      sortable: true,
      render: (r) => <Pill tone={locStatusTone[r.status]}>{r.status}</Pill>,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={item?.name ?? (itemQ.isLoading ? "Memuat…" : "Detail Stock Barang")}
        description={
          item
            ? `${item.sku} · klik baris lokasi untuk membuka kartu stock`
            : "Lokasi stock per gudang, rak, dan bin"
        }
        actions={
          <>
            <Button variant="outline" className="rounded-xl" asChild>
              <Link to="/persediaan/stock">
                <ArrowLeft className="h-4 w-4" /> Kembali
              </Link>
            </Button>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          loading={locQ.isLoading}
          label="Total Stock"
          value={`${formatNumber(totals.stock)} ${unit}`}
          icon={Boxes}
          tone="info"
        />
        <StatCard
          loading={locQ.isLoading}
          label="Total Available"
          value={`${formatNumber(totals.available)} ${unit}`}
          icon={Boxes}
          tone="success"
        />
        <StatCard
          loading={locQ.isLoading}
          label="Total Reserved"
          value={`${formatNumber(totals.reserved)} ${unit}`}
          icon={Boxes}
          tone="warning"
        />
        <StatCard
          loading={locQ.isLoading}
          label="Total Nilai"
          value={formatIDRCompact(totals.nilai)}
          valueTitle={formatIDR(totals.nilai)}
          icon={Boxes}
        />
      </div>

      <Panel title="Ringkasan Barang" description="Data master barang">
        {itemQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Memuat data barang…</p>
        ) : item ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <Field label="SKU" value={item.sku} />
            <Field label="Nama" value={item.name} />
            <Field label="Kategori" value={item.category ?? "—"} />
            <Field label="Sub Kategori" value={item.subCategory ?? "—"} />
            <Field label="Merk" value={item.brand ?? "—"} />
            <Field label="Satuan" value={item.unit ?? "—"} />
            <Field label="Supplier" value={item.supplier ?? "—"} />
            <Field label="Harga Pokok (master)" value={formatIDR(item.cost)} />
            <Field
              label="Min / Max"
              value={`${formatNumber(item.min)} / ${item.max != null ? formatNumber(item.max) : "—"}`}
            />
            <Field label="Lead Time" value={`${formatNumber(item.leadTime)} hari`} />
            <Field label="Gudang Default" value={item.warehouse ?? "—"} />
            <Field label="Status" value={item.status} />
          </div>
        ) : (
          <EmptyState title="Data barang belum tersedia" description="Coba tekan Refresh." />
        )}
        {item && (
          <div className="mt-4">
            <Button variant="outline" size="sm" className="rounded-xl" asChild>
              <Link to="/master/barang/$id" params={{ id: String(item.id) }}>
                Lihat Master Barang
              </Link>
            </Button>
          </div>
        )}
      </Panel>

      <Panel
        title="Lokasi Stock"
        description={`${formatNumber(locations.length)} lokasi · data terbaru per posting terakhir · klik baris untuk kartu stock`}
      >
        <DataTable
          columns={locColumns}
          rows={locations}
          pageSize={12}
          loading={locQ.isLoading}
          onRowClick={(r) => goToCard(r.warehouse_id)}
          mobileCard={(r) => (
            <div className="space-y-2">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <p className="truncate text-sm font-semibold">
                  {r.warehouse ?? "—"} · {r.rack ?? "Lantai"} · {r.bin ?? "Lantai"}
                </p>
                <Pill tone={locStatusTone[r.status]}>{r.status}</Pill>
              </div>
              <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/60 p-2 text-center text-xs">
                <div>
                  <p className="text-muted-foreground">Stock</p>
                  <b>
                    {formatNumber(r.stock)} {r.unit ?? ""}
                  </b>
                </div>
                <div>
                  <p className="text-muted-foreground">Reserved</p>
                  <b>
                    {formatNumber(r.reserved)} {r.unit ?? ""}
                  </b>
                </div>
                <div>
                  <p className="text-muted-foreground">Available</p>
                  <b>
                    {formatNumber(r.available)} {r.unit ?? ""}
                  </b>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-1 rounded-lg"
                onClick={() => goToCard(r.warehouse_id)}
              >
                Buka Kartu Stock
              </Button>
            </div>
          )}
        />
      </Panel>

      <Panel title="Nilai Persediaan" description="Hasil fold ledger · terakhir bergerak">
        {valQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Memuat valuasi…</p>
        ) : valuation ? (
          <ValuationBody v={valuation} unit={unit} />
        ) : (
          <EmptyState
            title="Belum ada valuasi"
            description="Barang ini belum memiliki pergerakan stock."
          />
        )}
      </Panel>

      <Panel title="Status Minimum" description="Kecukupan stock + saran restock">
        {minQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Memuat status minimum…</p>
        ) : minimum ? (
          <MinimumBody m={minimum} unit={unit} />
        ) : (
          <EmptyState title="Data minimum belum tersedia" description="Coba tekan Refresh." />
        )}
      </Panel>

      <Panel
        title="Pergerakan Terakhir"
        description="10 mutasi terakhir · klik nomor untuk detail dokumen"
        actions={
          validId !== undefined ? (
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => goToCard()}>
              Buka Kartu Stock
            </Button>
          ) : undefined
        }
      >
        {cardQ.isLoading || cardQ.isFetching ? (
          <p className="text-sm text-muted-foreground">Memuat pergerakan…</p>
        ) : recentMoves.length === 0 ? (
          <EmptyState
            title="Belum ada pergerakan"
            description="Mutasi stock barang ini akan tampil di sini."
          />
        ) : (
          <ul className="divide-y divide-border">
            {recentMoves.map((r, i) => (
              <li key={`${r.no}-${i}`} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => r.document_id != null && setSelectedDocId(r.document_id)}
                    className="font-mono text-xs font-semibold text-primary underline-offset-4 hover:underline"
                  >
                    {r.no}
                  </button>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatDate(r.date)} · {r.type} · {r.pic}
                  </p>
                </div>
                <p
                  className={`shrink-0 text-sm font-semibold ${r.masuk ? "text-success" : "text-destructive"}`}
                >
                  {r.masuk ? `+${formatNumber(r.masuk)}` : `-${formatNumber(r.keluar)}`}{" "}
                  {r.unit ?? ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <StockDocumentSheet
        doc={docDetail?.data ?? null}
        isLoading={docLoading}
        onOpenChange={(o) => !o && setSelectedDocId(null)}
      />
    </div>
  );
}

function BackHeader({ title }: { title: string }) {
  return (
    <PageHeader
      title={title}
      actions={
        <Button variant="outline" className="rounded-xl" asChild>
          <Link to="/persediaan/stock">
            <ArrowLeft className="h-4 w-4" /> Kembali
          </Link>
        </Button>
      }
    />
  );
}

function ValuationBody({ v, unit }: { v: StockValuationApi; unit: string }) {
  const methods = [
    { label: "FIFO", cost: v.unit_cost_fifo, nilai: v.nilai_fifo },
    { label: "Average", cost: v.unit_cost_avg, nilai: v.nilai_avg },
    { label: "Estimasi Maksimum", cost: v.unit_cost_max, nilai: v.nilai_max },
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Pergerakan terakhir:</span>
        <b>{v.last_move_at ? formatDate(v.last_move_at) : "—"}</b>
        <Pill tone={movingTone(v.moving)}>{v.moving}</Pill>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {methods.map((m) => (
          <div key={m.label} className="rounded-xl border border-border p-4">
            <p className="text-xs font-semibold text-muted-foreground">{m.label}</p>
            <p className="mt-1 text-lg font-bold">{formatIDR(m.nilai)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              HPP {formatIDR(m.cost)} / {unit}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function MinimumBody({ m, unit }: { m: StockMinimumApi; unit: string }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={minStatusTone[m.status]}>{m.status}</Pill>
        <span className="text-sm text-muted-foreground">
          Total {formatNumber(m.total_stock)} {unit} · tersedia {formatNumber(m.available)} {unit}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field
          label="Pemakaian harian rata-rata"
          value={`${formatNumber(m.avg_daily_usage)} ${unit}/hari`}
        />
        <Field
          label="Days of cover"
          value={m.days_of_cover != null ? `${m.days_of_cover} hari` : "—"}
        />
        <Field label="Saran restock" value={`${formatNumber(m.suggested_qty)} ${unit}`} />
        <Field label="Lead time" value={`${formatNumber(m.lead_time)} hari`} />
      </div>
    </div>
  );
}
