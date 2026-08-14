import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { BarangMasukForm } from "@/components/wms/barang-masuk-form";
import { PageHeader } from "@/components/wms/kit";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/pengadaan/receive-goods/new")({
  head: () => ({
    meta: [
      { title: "Terima Barang dari PO — KelolaGudang" },
      { name: "description", content: "Catat penerimaan barang berdasarkan Purchase Order." },
      { property: "og:title", content: "Terima Barang dari PO — KelolaGudang" },
      { property: "og:description", content: "Form penerimaan barang dari PO." },
    ],
  }),
  component: ReceiveGoodsNew,
});

function ReceiveGoodsNew() {
  const { hasModuleLevel } = useAuth();
  const canCreate = hasModuleLevel("Persediaan", "Tulis");

  if (!canCreate) {
    return (
      <>
        <PageHeader
          title="Akses dibatasi"
          description="Role Anda hanya memiliki akses baca untuk modul ini."
        />
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Anda tidak dapat membuat dokumen Receive Goods.
          </p>
          <Button asChild variant="outline" className="mt-4 rounded-xl">
            <Link to="/pengadaan/receive-goods">
              <ArrowLeft className="h-4 w-4" /> Kembali ke Daftar
            </Link>
          </Button>
        </div>
      </>
    );
  }

  return (
    <BarangMasukForm
      backTo="/pengadaan/receive-goods"
      title="Terima Barang dari PO"
      description="Catat penerimaan barang dari supplier berdasarkan PO"
      referenceLabel="No. PO"
      requireReference
      referenceCombobox
    />
  );
}
