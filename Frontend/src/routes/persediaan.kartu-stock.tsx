import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Boxes, Printer, Wallet } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader, Panel, Pill, StatCard } from "@/components/wms/kit";
import { TrxDetailSheet } from "@/components/wms/trx-detail-sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DataTable, type Column } from "@/components/wms/data-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useItems } from "@/hooks/use-master";
import { useStockCard } from "@/hooks/use-persediaan";
import type { StockCardRowApi, ValuationMethod } from "@/lib/persediaan-types";
import { valuationMethodLabels } from "@/lib/persediaan-types";
import { formatDate, formatIDR, formatNumber, valuationMethods, type Trx } from "@/lib/wms-data";

export const Route = createFileRoute("/persediaan/kartu-stock")({
  head: () => ({
    meta: [
      { title: "Kartu Stock — KelolaGudang" },
      { name: "description", content: "Riwayat mutasi masuk, keluar, dan saldo stok per barang." },
      { property: "og:title", content: "Kartu Stock — KelolaGudang" },
      {
        property: "og:description",
        content: "Telusuri pergerakan stok tiap barang secara detail.",
      },
    ],
  }),
  component: KartuStock,
});

function KartuStock() {
  const { data: itemsData, isLoading: itemsLoading } = useItems();
  const options = useMemo(() => (itemsData?.data ?? []).slice(0, 40), [itemsData]);
  const [id, setId] = useState<number | null>(null);
  const [method, setMethod] = useState<ValuationMethod>("FIFO");
  const [detail, setDetail] = useState<Trx | null>(null);
  const activeId = id ?? options[0]?.id;

  const cardFifo = useStockCard(activeId, "FIFO");
  const cardAvg = useStockCard(activeId, "Average");
  const cardMax = useStockCard(activeId, "Maximum Cost");
  const card = method === "FIFO" ? cardFifo : method === "Average" ? cardAvg : cardMax;
  const methodCards: Record<ValuationMethod, typeof card> = {
    FIFO: cardFifo,
    Average: cardAvg,
    "Maximum Cost": cardMax,
  };

  const item = card.data?.data.item;
  const cardData = card.data?.data;
  const rows = useMemo(() => cardData?.rows ?? [], [cardData]);
  const unit = item?.unit ?? "pcs";
  const saldoAwal = cardData?.saldo_awal ?? 0;
  const lastRow = rows[rows.length - 1];

  const totalMasuk = rows.reduce((a, r) => a + r.masuk, 0);
  const totalKeluar = rows.reduce((a, r) => a + r.keluar, 0);

  const tableRows = useMemo(() => rows.map((r, i) => ({ ...r, id: `${r.no}-${i}` })), [rows]);

  const chart = useMemo(
    () =>
      rows.map((r) => ({
        date: formatDate(r.date).slice(0, 6),
        saldo: r.saldo,
        nilai: r.nilai,
      })),
    [rows],
  );

  const toTrx = (r: StockCardRowApi, it: NonNullable<typeof item>): Trx => {
    const qty = r.masuk || r.keluar;
    const type: Trx["type"] =
      r.type === "Penerimaan"
        ? "Barang Masuk"
        : r.type === "Pengeluaran"
          ? "Barang Keluar"
          : "Stock Adjustment";
    return {
      id: `${it.id}-${r.no}`,
      no: r.no,
      type,
      date: r.date,
      warehouse: it.warehouse ?? "—",
      partner: r.partner,
      reference: r.reference,
      qty,
      value: qty * r.unit_cost,
      status: "Selesai",
      pic: r.pic,
      lines: [{ name: it.name, sku: it.sku, qty, unit: r.unit ?? "pcs", price: r.unit_cost }],
    };
  };

  const columns: Column<(typeof tableRows)[number]>[] = [
    {
      key: "date",
      label: "Tanggal",
      className: "whitespace-nowrap",
      render: (r) => formatDate(r.date),
    },
    {
      key: "no",
      label: "Nomor",
      className: "whitespace-nowrap",
      render: (r) => (
        <button
          type="button"
          onClick={() => item && setDetail(toTrx(r, item))}
          className="font-mono text-xs font-semibold text-primary underline-offset-4 hover:underline"
        >
          {r.no}
        </button>
      ),
    },
    {
      key: "type",
      label: "Jenis",
      className: "min-w-[140px] whitespace-nowrap",
      render: (r) => <Pill tone={r.masuk ? "success" : "warning"}>{r.type}</Pill>,
    },
    {
      key: "unit",
      label: "Satuan",
      className: "w-[80px] whitespace-nowrap",
      render: (r) => r.unit ?? "—",
    },
    {
      key: "masuk",
      label: "Masuk",
      className: "text-right w-[100px] whitespace-nowrap text-success",
      render: (r) => (r.masuk ? `+${formatNumber(r.masuk)}` : "-"),
    },
    {
      key: "keluar",
      label: "Keluar",
      className: "text-right w-[100px] whitespace-nowrap text-destructive",
      render: (r) => (r.keluar ? `-${formatNumber(r.keluar)}` : "-"),
    },
    {
      key: "saldo",
      label: "Saldo",
      className: "text-right w-[100px] whitespace-nowrap font-semibold",
      render: (r) => `${formatNumber(r.saldo)} ${r.unit ?? ""}`,
    },
    {
      key: "nilai",
      label: `Nilai (${method})`,
      className: "text-right min-w-[130px] whitespace-nowrap",
      render: (r) => formatIDR(r.nilai),
    },
    {
      key: "pic",
      label: "PIC",
      className: "min-w-[120px] whitespace-nowrap",
      render: (r) => r.pic,
    },
    {
      key: "note",
      label: "Catatan",
      className: "max-w-[240px]",
      render: (r) => (
        <span className="block truncate text-muted-foreground" title={r.note}>
          {r.note}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Kartu Stock"
        description="Riwayat pergerakan stok per barang"
        actions={
          <>
            <div className="flex rounded-xl border border-border bg-card p-1">
              {valuationMethods.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                    method === m
                      ? "bg-primary text-primary-foreground shadow-soft"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {valuationMethodLabels[m]}
                </button>
              ))}
            </div>
            <Button variant="outline" className="rounded-xl">
              <Printer className="h-4 w-4" /> Cetak
            </Button>
          </>
        }
      />

      <Panel title="Pilih Barang">
        <Select
          value={activeId != null ? String(activeId) : ""}
          onValueChange={(v) => setId(Number(v))}
        >
          <SelectTrigger className="max-w-md rounded-xl">
            <SelectValue placeholder="Pilih barang…" />
          </SelectTrigger>
          <SelectContent className="max-h-72 rounded-xl">
            {options.map((o) => (
              <SelectItem key={o.id} value={String(o.id)}>
                {o.name} — {o.sku}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Panel>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Saldo Awal"
          value={`${formatNumber(Math.max(saldoAwal, 0))} ${unit}`}
          icon={Boxes}
          tone="info"
        />
        <StatCard
          label="Total Masuk"
          value={`${formatNumber(totalMasuk)} ${unit}`}
          icon={ArrowDownLeft}
          tone="success"
        />
        <StatCard
          label="Total Keluar"
          value={`${formatNumber(totalKeluar)} ${unit}`}
          icon={ArrowUpRight}
          tone="warning"
        />
        <StatCard
          label={`Nilai Akhir — ${valuationMethodLabels[method]}`}
          value={formatIDR(lastRow?.nilai ?? 0)}
          hint={`${formatNumber(cardData?.saldo_akhir ?? 0)} ${unit} × ${formatIDR(lastRow?.method_cost ?? 0)}`}
          icon={Wallet}
        />
      </div>

      <Panel
        title="Pergerakan Saldo Stok"
        description={`Satuan ${unit} · nilai memakai metode ${valuationMethodLabels[method]}`}
      >
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chart}>
            <defs>
              <linearGradient id="ksArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="date" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis fontSize={12} tickLine={false} axisLine={false} width={50} />
            <Tooltip
              formatter={(v: number, n) =>
                n === "nilai" ? formatIDR(v) : `${formatNumber(v)} ${unit}`
              }
              contentStyle={{
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "var(--card)",
                fontSize: 12,
              }}
            />
            <Area
              type="monotone"
              dataKey="saldo"
              name="Saldo"
              stroke="var(--primary)"
              fill="url(#ksArea)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </Panel>

      <Panel
        title="Nilai Stok per Metode"
        description="Perbandingan FIFO, Average, dan Estimasi Maksimum"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {valuationMethods.map((m) => {
            const c = methodCards[m];
            const cRows = c.data?.data.rows ?? [];
            const cLast = cRows[cRows.length - 1];
            return (
              <div
                key={m}
                className={cn(
                  "rounded-xl border p-4",
                  m === method ? "border-primary/40 bg-primary-soft" : "border-border",
                )}
              >
                <p className="text-xs font-semibold text-muted-foreground">{valuationMethodLabels[m]}</p>
                <p className="mt-1 text-lg font-bold">{formatIDR(cLast?.nilai ?? 0)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  HPP {formatIDR(cLast?.method_cost ?? 0)} / {unit}
                </p>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel
        title={item?.name ?? "Memuat…"}
        description={`${item?.sku ?? ""} · saldo akhir ${formatNumber(cardData?.saldo_akhir ?? 0)} ${unit}`}
      >
        <DataTable
          columns={columns}
          rows={tableRows}
          pageSize={10}
          loading={itemsLoading || card.isFetching}
          onRowClick={(r) => item && setDetail(toTrx(r, item))}
          mobileCard={(r) => (
            <div className="space-y-2">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.no}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(r.date)}</p>
                </div>
                <Pill tone={r.masuk ? "success" : "warning"}>
                  {r.masuk ? `+${formatNumber(r.masuk)}` : `-${formatNumber(r.keluar)}`}{" "}
                  {r.unit ?? ""}
                </Pill>
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/60 p-2 text-xs text-muted-foreground">
                <p>Jenis: {r.type}</p>
                <p>
                  Saldo: {formatNumber(r.saldo)} {r.unit ?? ""}
                </p>
                <p>
                  Nilai ({method}): {formatIDR(r.nilai)}
                </p>
                <p>PIC: {r.pic}</p>
              </div>
              <p className="truncate text-xs text-muted-foreground">Catatan: {r.note}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-1 rounded-lg"
                onClick={() => item && setDetail(toTrx(r, item))}
              >
                Lihat Detail
              </Button>
            </div>
          )}
        />
      </Panel>

      <TrxDetailSheet trx={detail} onOpenChange={(o) => !o && setDetail(null)} editable={false} />
    </>
  );
}
