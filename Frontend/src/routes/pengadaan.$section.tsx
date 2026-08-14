import { createFileRoute, notFound } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Download,
  Plus,
  Printer,
  Search,
  ShoppingCart,
  PackageCheck,
  ClipboardList,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import {
  ALL,
  FilterSelect,
  PageHeader,
  Panel,
  Pill,
  StatCard,
  type Tone,
} from "@/components/wms/kit";
import { DataTable, type Column } from "@/components/wms/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useAuth } from "@/hooks/use-auth";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  formatDate,
  formatIDR,
  formatIDRCompact,
  formatNumber,
  goodsReceipts,
  purchaseOrders,
  type ProcDoc,
} from "@/lib/wms-data";

const sections = {
  "purchase-order": {
    title: "Purchase Order",
    description: "Pesanan pembelian resmi ke supplier",
    docs: purchaseOrders,
    partnerLabel: "Supplier",
    refLabel: "No. PR",
    cta: "Buat Purchase Order",
    icon: ShoppingCart,
  },
  "receive-goods": {
    title: "Receive Goods",
    description: "Penerimaan barang berdasarkan Purchase Order",
    docs: goodsReceipts,
    partnerLabel: "Supplier",
    refLabel: "No. PO",
    cta: "Terima Barang dari PO",
    icon: PackageCheck,
  },
} as const;

type SectionKey = keyof typeof sections;

export const Route = createFileRoute("/pengadaan/$section")({
  beforeLoad: ({ params }) => {
    if (!(params.section in sections)) throw notFound();
  },
  head: ({ params }) => {
    const s = sections[params.section as SectionKey];
    const title = `${s?.title ?? "Pengadaan"} — KelolaGudang`;
    const description = s?.description ?? "Modul pengadaan KelolaGudang.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: PengadaanPage,
});

const statusTone = (s: ProcDoc["status"]): Tone =>
  s === "Selesai" || s === "Disetujui"
    ? "success"
    : s === "Ditolak" || s === "Dibatalkan"
      ? "danger"
      : s === "Draft"
        ? "neutral"
        : s === "Sebagian Diterima"
          ? "info"
          : "warning";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border px-3 py-2">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function ProcDetailSheet({
  doc,
  partnerLabel,
  refLabel,
  onOpenChange,
}: {
  doc: ProcDoc | null;
  partnerLabel: string;
  refLabel: string;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={!!doc} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl lg:max-w-2xl"
      >
        {doc && (
          <>
            <SheetHeader className="border-b border-border px-5 py-4 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="text-base">{doc.no}</SheetTitle>
                <Pill tone={statusTone(doc.status)}>{doc.status}</Pill>
              </div>
              <SheetDescription>
                {formatDate(doc.date)} · {doc.department} · PIC {doc.requester}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div className="grid gap-2.5 sm:grid-cols-2">
                <Field label={partnerLabel} value={doc.supplier} />
                <Field label="Gudang Tujuan" value={doc.warehouse} />
                <Field label={refLabel} value={doc.reference} />
                <Field label="Tanggal Dibutuhkan" value={formatDate(doc.needDate)} />
                <Field label="Total Qty" value={formatNumber(doc.qty)} />
                <Field label="Total Nilai" value={formatIDR(doc.value)} />
              </div>

              <div className="rounded-xl border border-border">
                <p className="border-b border-border px-3 py-2 text-xs font-semibold text-muted-foreground">
                  Daftar Barang
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="px-3 py-2">Barang</th>
                        <th className="px-3 py-2">Qty</th>
                        <th className="px-3 py-2">Satuan</th>
                        <th className="px-3 py-2 text-right">Harga</th>
                        <th className="px-3 py-2 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {doc.lines.map((l, i) => (
                        <tr key={`${l.sku}-${i}`} className="border-t border-border/70">
                          <td className="px-3 py-2">
                            <p className="font-medium text-foreground">{l.name}</p>
                            <p className="text-xs text-muted-foreground">{l.sku}</p>
                          </td>
                          <td className="px-3 py-2">{formatNumber(l.qty)}</td>
                          <td className="px-3 py-2">{l.unit}</td>
                          <td className="px-3 py-2 text-right">{formatIDR(l.price)}</td>
                          <td className="px-3 py-2 text-right font-semibold">
                            {formatIDR(l.qty * l.price)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-xl border border-border px-3 py-2.5">
                <p className="text-[11px] font-medium text-muted-foreground">Catatan</p>
                <p className="text-sm text-foreground">{doc.note}</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => toast.success(`Dokumen ${doc.no} dikirim ke printer`)}
              >
                <Printer className="h-4 w-4" />
                Cetak
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function PengadaanPage() {
  const { section } = Route.useParams();
  const { hasModuleLevel } = useAuth();
  const canWrite = hasModuleLevel("Pengadaan", "Tulis");
  const cfg = sections[section as SectionKey];
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [status, setStatus] = useState(ALL);
  const [active, setActive] = useState<ProcDoc | null>(null);

  const statuses = useMemo(() => Array.from(new Set(cfg.docs.map((d) => d.status))), [cfg.docs]);

  const rows = useMemo(
    () =>
      cfg.docs.filter((d) => {
        const okQ =
          !debouncedQ ||
          [d.no, d.supplier, d.reference, d.department, d.requester]
            .join(" ")
            .toLowerCase()
            .includes(debouncedQ.toLowerCase());
        return okQ && (status === ALL || d.status === status);
      }),
    [cfg.docs, debouncedQ, status],
  );

  const totalValue = rows.reduce((a, b) => a + b.value, 0);
  const openDocs = rows.filter(
    (d) => d.status === "Menunggu Approval" || d.status === "Sebagian Diterima",
  ).length;
  const doneDocs = rows.filter((d) => d.status === "Selesai" || d.status === "Disetujui").length;

  const columns: Column<ProcDoc>[] = [
    {
      key: "no",
      label: "Nomor",
      render: (r) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setActive(r);
          }}
          className="font-semibold text-primary hover:underline"
        >
          {r.no}
        </button>
      ),
    },
    { key: "date", label: "Tanggal", render: (r) => formatDate(r.date) },
    { key: "supplier", label: cfg.partnerLabel, render: (r) => r.supplier },
    { key: "ref", label: cfg.refLabel, render: (r) => r.reference },
    { key: "dept", label: "Departemen", render: (r) => r.department },
    { key: "qty", label: "Qty", render: (r) => formatNumber(r.qty) },
    {
      key: "value",
      label: "Nilai",
      className: "text-right",
      render: (r) => <span className="font-semibold">{formatIDR(r.value)}</span>,
    },
    {
      key: "status",
      label: "Status",
      render: (r) => <Pill tone={statusTone(r.status)}>{r.status}</Pill>,
    },
  ];

  return (
    <>
      <PageHeader
        title={cfg.title}
        description={cfg.description}
        actions={
          <>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => toast.success("Data diekspor ke Excel")}
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
            {canWrite && (
              <Button className="rounded-xl" onClick={() => toast.info(`${cfg.cta} — form demo`)}>
                <Plus className="h-4 w-4" />
                {cfg.cta}
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total Dokumen" value={formatNumber(rows.length)} icon={cfg.icon} />
        <StatCard
          label="Perlu Tindakan"
          value={formatNumber(openDocs)}
          icon={ClipboardList}
          tone="warning"
        />
        <StatCard
          label="Selesai / Disetujui"
          value={formatNumber(doneDocs)}
          icon={PackageCheck}
          tone="success"
        />
        <StatCard
          label="Nilai Total"
          value={formatIDRCompact(totalValue)}
          valueTitle={formatIDR(totalValue)}
          icon={Wallet}
          tone="info"
        />
      </div>

      <Panel title="Daftar Dokumen" description="Klik nomor dokumen untuk melihat detail">
        <div className="mb-4 grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari nomor, supplier, referensi..."
              className="rounded-xl pl-9"
            />
          </div>
          <FilterSelect
            className="w-full"
            value={status}
            onChange={setStatus}
            placeholder="Semua Status"
            options={statuses}
          />
        </div>

        <DataTable
          columns={columns}
          rows={rows}
          onRowClick={(r) => setActive(r)}
          mobileCard={(r) => (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold text-primary">{r.no}</p>
                <Pill tone={statusTone(r.status)}>{r.status}</Pill>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {formatDate(r.date)} · {r.supplier}
              </p>
              <p className="text-xs text-muted-foreground">
                {cfg.refLabel}: {r.reference} · {formatNumber(r.qty)} qty
              </p>
              <p className="text-sm font-semibold">{formatIDR(r.value)}</p>
            </div>
          )}
        />
      </Panel>

      <ProcDetailSheet
        doc={active}
        partnerLabel={cfg.partnerLabel}
        refLabel={cfg.refLabel}
        onOpenChange={(o) => !o && setActive(null)}
      />
    </>
  );
}
