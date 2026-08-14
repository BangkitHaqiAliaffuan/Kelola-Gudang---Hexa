import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProcDocPo } from "@/hooks/use-purchase-order";
import { formatDate, formatIDR, formatNumber } from "@/lib/wms-data";

export const Route = createFileRoute("/pengadaan/purchase-order/print/$id")({
  head: () => ({
    meta: [
      { title: "Cetak Purchase Order — KelolaGudang" },
      { name: "description", content: "Cetak / simpan PDF Purchase Order." },
    ],
  }),
  component: PurchaseOrderPrint,
});

function PurchaseOrderPrint() {
  const { id } = Route.useParams();
  const { data } = useProcDocPo(Number(id));
  const doc = data?.data;

  useEffect(() => {
    const t = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(t);
  }, []);

  if (!doc) return null;

  const lines = doc.lines ?? [];
  const totalValue = lines.reduce((sum, l) => sum + l.subtotal, 0);

  return (
    <div className="min-h-screen bg-muted/40 p-4 print:bg-white print:p-0">
      <div className="mx-auto max-w-[760px] space-y-5 rounded-2xl border border-border bg-white p-8 shadow-soft print:max-w-none print:border-0 print:shadow-none">
        <div className="flex print:hidden">
          <Button onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Cetak / Simpan PDF
          </Button>
        </div>

        <div className="flex items-start justify-between gap-4 border-b border-border pb-5">
          <div>
            <p className="text-xl font-bold">
              Kelola<span className="font-normal">Gudang</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Warehouse Management System</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-primary">PURCHASE ORDER</p>
            <p className="font-mono text-sm">{doc.no}</p>
            <p className="text-xs text-muted-foreground">{doc.status}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm print:grid-cols-3">
          <PrintField label="Supplier" value={doc.supplier ?? "—"} />
          <PrintField label="Gudang Tujuan" value={doc.warehouse ?? "—"} />
          <PrintField label="No. PR" value={doc.reference ?? "—"} />
          <PrintField label="Tanggal" value={formatDate(doc.document_date)} />
          <PrintField label="Departemen" value={doc.department ?? "—"} />
          <PrintField label="Requester" value={doc.requester ?? "—"} />
          <PrintField label="Dibuat oleh" value={doc.created_by ?? "—"} />
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2">Barang</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2">Satuan</th>
              <th className="py-2 text-right">Harga</th>
              <th className="py-2 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b border-border/60">
                <td className="py-2">
                  <p className="font-medium">{l.name ?? "—"}</p>
                  <p className="font-mono text-xs text-muted-foreground">{l.sku}</p>
                </td>
                <td className="py-2 text-right">{formatNumber(l.qty)}</td>
                <td className="py-2">{l.unit ?? "—"}</td>
                <td className="py-2 text-right">{formatIDR(l.price)}</td>
                <td className="py-2 text-right font-semibold">{formatIDR(l.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end">
          <div className="w-64 space-y-2 rounded-xl border border-border px-4 py-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Qty</span>
              <b>{formatNumber(doc.qty_total ?? 0)}</b>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Nilai</span>
              <b>{formatIDR(totalValue)}</b>
            </div>
          </div>
        </div>

        {doc.note && (
          <div className="rounded-xl border border-border px-4 py-3 text-sm">
            <p className="text-xs font-semibold text-muted-foreground">Catatan</p>
            <p className="mt-1">{doc.note}</p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-6 pt-10 text-sm print:grid-cols-3">
          <Signature label="Disetujui oleh" />
          <Signature label="Dibuat oleh" />
          <Signature label="Supplier" />
        </div>
      </div>
    </div>
  );
}

function PrintField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="font-semibold text-foreground">{value}</p>
    </div>
  );
}

function Signature({ label }: { label: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="pt-8" />
      <div className="border-t border-border" />
      <p className="pt-1 text-xs text-muted-foreground">Tanda tangan</p>
    </div>
  );
}
