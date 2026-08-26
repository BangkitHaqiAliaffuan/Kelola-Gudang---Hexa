import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { StockAdjustmentForm } from "@/components/wms/stock-adjustment-form";
import { PageHeader } from "@/components/wms/kit";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/persediaan/adjustment/new")({
  head: () => ({
    meta: [
      { title: "Tambah Stock Adjustment — KelolaGudang" },
      {
        name: "description",
        content: "Buat dokumen penyesuaian stok: koreksi selisih stok fisik vs sistem.",
      },
      { property: "og:title", content: "Tambah Stock Adjustment — KelolaGudang" },
      { property: "og:description", content: "Form penyesuaian stok (tambah/kurangi)." },
    ],
  }),
  component: StockAdjustmentNew,
});

function StockAdjustmentNew() {
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
            Anda tidak dapat membuat dokumen Stock Adjustment.
          </p>
          <Button asChild variant="outline" className="mt-4 rounded-xl">
            <Link to="/persediaan/adjustment">
              <ArrowLeft className="h-4 w-4" /> Kembali ke Daftar
            </Link>
          </Button>
        </div>
      </>
    );
  }

  return <StockAdjustmentForm />;
}
