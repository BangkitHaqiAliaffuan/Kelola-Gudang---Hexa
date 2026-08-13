import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { ALL, FilterSelect, PageHeader, Panel, Pill } from "./kit";
import { DataTable, type Column } from "./data-table";
import { TrxDetailSheet } from "./trx-detail-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useAuth } from "@/hooks/use-auth";
import {
  customers,
  formatDate,
  formatIDR,
  formatNumber,
  suppliers,
  transactions,
  warehouses,
  workOrders,
  type Trx,
  type TrxType,
} from "@/lib/wms-data";

const statusTone = (s: Trx["status"]) =>
  s === "Selesai"
    ? ("success" as const)
    : s === "Draft"
      ? ("neutral" as const)
      : s === "Dibatalkan"
        ? ("danger" as const)
        : ("warning" as const);

/** Dummy: sebagian pengeluaran ditujukan ke produksi (proyek + work order). */
function outTarget(t: Trx) {
  const n = Number(t.no.slice(-3).replace(/\D/g, "")) || 0;
  if (n % 3 === 0) {
    const wo = workOrders[n % workOrders.length]!;
    return { label: `Produksi · ${wo.no}`, hint: wo.project, production: true };
  }
  return { label: t.partner, hint: "", production: false };
}

export function TransactionPage({
  variant,
  type,
  title,
  description,
  section,
}: {
  variant: "masuk" | "keluar" | "transfer";
  type: TrxType;
  title: string;
  description: string;
  section: string;
}) {
  const { hasModuleLevel } = useAuth();
  const canCreate = hasModuleLevel("Transaksi", "Tulis");
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [wh, setWh] = useState(ALL);
  const [partner, setPartner] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [detail, setDetail] = useState<Trx | null>(null);

  const rows = useMemo(
    () =>
      transactions.filter(
        (t) =>
          t.type === type &&
          (!debouncedQ ||
            `${t.no} ${t.partner}`.toLowerCase().includes(debouncedQ.toLowerCase())) &&
          (wh === ALL || t.warehouse === wh) &&
          (partner === ALL || t.partner === partner) &&
          (status === ALL || t.status === status),
      ),
    [debouncedQ, wh, partner, status, type],
  );

  const columns: Column<Trx>[] = [
    {
      key: "no",
      label: "Nomor",
      render: (r) => (
        <button
          type="button"
          onClick={() => setDetail(r)}
          className="font-mono text-xs font-semibold text-primary underline-offset-4 hover:underline"
        >
          {r.no}
        </button>
      ),
    },
    { key: "date", label: "Tanggal", render: (r) => formatDate(r.date) },
    {
      key: "wh",
      label: variant === "transfer" ? "Gudang Asal" : "Gudang",
      render: (r) => r.warehouse,
    },
    {
      key: "partner",
      label: variant === "transfer" ? "Gudang Tujuan" : variant === "masuk" ? "Supplier" : "Tujuan",
      render: (r) => {
        if (variant === "transfer") return r.destination ?? "-";
        if (type !== "Barang Keluar") return r.partner;
        const t = outTarget(r);
        return (
          <span className="flex flex-col">
            <span className={t.production ? "font-medium text-primary" : ""}>{t.label}</span>
            {t.hint && <span className="text-xs text-muted-foreground">{t.hint}</span>}
          </span>
        );
      },
    },
    { key: "ref", label: "Referensi", render: (r) => r.reference },
    { key: "qty", label: "Qty", className: "text-right", render: (r) => formatNumber(r.qty) },
    { key: "val", label: "Nilai", className: "text-right", render: (r) => formatIDR(r.value) },
    { key: "pic", label: "PIC", render: (r) => r.pic },
    {
      key: "status",
      label: "Status",
      render: (r) => <Pill tone={statusTone(r.status)}>{r.status}</Pill>,
    },
  ];

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          canCreate && (
            <Button asChild className="rounded-xl">
              <Link to="/transaksi/entri/$section" params={{ section }}>
                <Plus className="h-4 w-4" /> Buat {title}
              </Link>
            </Button>
          )
        }
      />

      {variant === "transfer" && (
        <Panel title="Status Transfer" description="Timeline pengiriman antar gudang">
          <ol className="grid gap-4 sm:grid-cols-4">
            {["Dibuat", "Barang Dikirim", "Dalam Perjalanan", "Diterima"].map((step, i) => (
              <li key={step} className="rounded-xl border border-border p-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${
                      i < 3
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <p className="truncate text-sm font-medium">{step}</p>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {i < 3 ? "31 Jul 2026, 09:2" + i : "Menunggu konfirmasi"}
                </p>
              </li>
            ))}
          </ol>
        </Panel>
      )}

      <Panel title="Filter">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari nomor transaksi..."
              className="rounded-xl pl-9"
            />
          </div>
          <FilterSelect
            className="w-full"
            value={wh}
            onChange={setWh}
            placeholder="Semua Gudang"
            options={warehouses.map((w) => w.name)}
          />
          <FilterSelect
            className="w-full"
            value={partner}
            onChange={setPartner}
            placeholder={variant === "masuk" ? "Semua Supplier" : "Semua Tujuan"}
            options={
              variant === "masuk"
                ? suppliers.slice(0, 25).map((s) => s.name)
                : customers.map((c) => c.name)
            }
          />
          <FilterSelect
            className="w-full"
            value={status}
            onChange={setStatus}
            placeholder="Semua Status"
            options={["Draft", "Menunggu Approval", "Dalam Perjalanan", "Selesai", "Dibatalkan"]}
          />
        </div>
      </Panel>

      <Panel title={`Daftar ${title}`} description={`${formatNumber(rows.length)} transaksi`}>
        <DataTable
          columns={columns}
          rows={rows}
          pageSize={12}
          onRowClick={(r) => setDetail(r)}
          mobileCard={(r) => (
            <div className="space-y-1.5">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <p className="truncate font-mono text-sm font-semibold">{r.no}</p>
                <Pill tone={statusTone(r.status)}>{r.status}</Pill>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {formatDate(r.date)} · {r.warehouse}
              </p>
              <p className="truncate text-xs">
                {variant === "transfer" ? r.destination : r.partner}
              </p>
              <div className="flex justify-between pt-1 text-xs">
                <span>{formatNumber(r.qty)} unit</span>
                <b>{formatIDR(r.value)}</b>
              </div>
            </div>
          )}
        />
      </Panel>

      <TrxDetailSheet trx={detail} onOpenChange={(o) => !o && setDetail(null)} />
    </>
  );
}
