import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Boxes, Printer, Wallet } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader, Panel, Pill, StatCard } from "@/components/wms/kit";
import { TrxDetailSheet } from "@/components/wms/trx-detail-sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatDate,
  formatIDR,
  formatNumber,
  items,
  stockCard,
  trxFromStockCard,
  valuationFactor,
  valuationMethods,
  type Trx,
  type ValuationMethod,
} from "@/lib/wms-data";

export const Route = createFileRoute("/persediaan/kartu-stock")({
  head: () => ({
    meta: [
      { title: "Kartu Stock — KelolaGudang" },
      { name: "description", content: "Riwayat mutasi masuk, keluar, dan saldo stok per barang." },
      { property: "og:title", content: "Kartu Stock — KelolaGudang" },
      { property: "og:description", content: "Telusuri pergerakan stok tiap barang secara detail." },
    ],
  }),
  component: KartuStock,
});

function KartuStock() {
  const options = items.slice(0, 40);
  const [id, setId] = useState(options[0]!.id);
  const [method, setMethod] = useState<ValuationMethod>("FIFO");
  const [detail, setDetail] = useState<Trx | null>(null);
  const item = items.find((i) => i.id === id)!;
  const rows = useMemo(() => stockCard(item), [item]);
  const f = valuationFactor[method];
  const unitCost = item.cost * f;

  const totalMasuk = rows.reduce((a, r) => a + r.masuk, 0);
  const totalKeluar = rows.reduce((a, r) => a + r.keluar, 0);
  const saldoAwal = (rows[rows.length - 1]?.saldo ?? item.stock) - (rows[rows.length - 1]?.masuk ?? 0);
  const chart = [...rows]
    .slice()
    .reverse()
    .map((r) => ({ date: formatDate(r.date).slice(0, 6), saldo: r.saldo, nilai: r.saldo * unitCost }));

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
                  {m}
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
        <Select value={id} onValueChange={setId}>
          <SelectTrigger className="max-w-md rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72 rounded-xl">
            {options.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name} — {o.sku}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Panel>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Saldo Awal"
          value={`${formatNumber(Math.max(saldoAwal, 0))} ${item.unit}`}
          icon={Boxes}
          tone="info"
        />
        <StatCard
          label="Total Masuk"
          value={`${formatNumber(totalMasuk)} ${item.unit}`}
          icon={ArrowDownLeft}
          tone="success"
        />
        <StatCard
          label="Total Keluar"
          value={`${formatNumber(totalKeluar)} ${item.unit}`}
          icon={ArrowUpRight}
          tone="warning"
        />
        <StatCard
          label={`Nilai Akhir — ${method}`}
          value={formatIDR(item.stock * unitCost)}
          hint={`${formatNumber(item.stock)} ${item.unit} × ${formatIDR(unitCost)}`}
          icon={Wallet}
        />
      </div>

      <Panel title="Pergerakan Saldo Stok" description={`Satuan ${item.unit} · nilai memakai metode ${method}`}>
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
              formatter={(v: number, n) => (n === "nilai" ? formatIDR(v) : `${formatNumber(v)} ${item.unit}`)}
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

      <Panel title="Nilai Stok per Metode" description="Perbandingan FIFO, Average, dan Maximum Cost">
        <div className="grid gap-3 sm:grid-cols-3">
          {valuationMethods.map((m) => (
            <div
              key={m}
              className={cn(
                "rounded-xl border p-4",
                m === method ? "border-primary/40 bg-primary-soft" : "border-border",
              )}
            >
              <p className="text-xs font-semibold text-muted-foreground">{m}</p>
              <p className="mt-1 text-lg font-bold">{formatIDR(item.stock * item.cost * valuationFactor[m])}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                HPP {formatIDR(item.cost * valuationFactor[m])} / {item.unit}
              </p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title={item.name} description={`${item.sku} · saldo akhir ${formatNumber(item.stock)} ${item.unit}`}>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                {[
                  "Tanggal",
                  "Nomor",
                  "Jenis",
                  "Satuan",
                  "Masuk",
                  "Keluar",
                  "Saldo",
                  `Nilai (${method})`,
                  "PIC",
                  "Catatan",
                ].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border/60 transition-colors hover:bg-accent/40">
                  <td className="px-3 py-2.5">{formatDate(r.date)}</td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => setDetail(trxFromStockCard(r, item))}
                      className="font-mono text-xs font-semibold text-primary underline-offset-4 hover:underline"
                    >
                      {r.no}
                    </button>
                  </td>
                  <td className="px-3 py-2.5">
                    <Pill tone={r.masuk ? "success" : "warning"}>{r.type}</Pill>
                  </td>
                  <td className="px-3 py-2.5">{r.unit}</td>
                  <td className="px-3 py-2.5 text-right text-success">{r.masuk ? `+${r.masuk}` : "-"}</td>
                  <td className="px-3 py-2.5 text-right text-destructive">{r.keluar ? `-${r.keluar}` : "-"}</td>
                  <td className="px-3 py-2.5 text-right font-semibold">
                    {formatNumber(r.saldo)} {r.unit}
                  </td>
                  <td className="px-3 py-2.5 text-right">{formatIDR(r.saldo * unitCost)}</td>
                  <td className="px-3 py-2.5">{r.pic}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Accordion type="single" collapsible className="space-y-2 md:hidden">
          {rows.map((r, i) => (
            <AccordionItem key={i} value={`r${i}`} className="rounded-xl border border-border px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 pr-2 text-left">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.no}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(r.date)}</p>
                  </div>
                  <Pill tone={r.masuk ? "success" : "warning"}>
                    {r.masuk ? `+${r.masuk}` : `-${r.keluar}`} {r.unit}
                  </Pill>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4 text-xs text-muted-foreground">
                <p>Jenis: {r.type}</p>
                <p>
                  Saldo: {formatNumber(r.saldo)} {r.unit}
                </p>
                <p>
                  Nilai ({method}): {formatIDR(r.saldo * unitCost)}
                </p>
                <p>PIC: {r.pic}</p>
                <p>Catatan: {r.note}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 rounded-lg"
                  onClick={() => setDetail(trxFromStockCard(r, item))}
                >
                  Lihat Detail
                </Button>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Panel>

      <TrxDetailSheet trx={detail} onOpenChange={(o) => !o && setDetail(null)} editable={false} />
    </>
  );
}