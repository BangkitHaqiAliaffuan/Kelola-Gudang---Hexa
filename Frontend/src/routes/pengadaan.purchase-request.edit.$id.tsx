import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { PurchaseRequestForm } from "@/components/wms/purchase-request-form";
import { EmptyState } from "@/components/wms/kit";
import { useProcDoc } from "@/hooks/use-pengadaan";

export const Route = createFileRoute("/pengadaan/purchase-request/edit/$id")({
  head: () => ({
    meta: [{ title: "Edit Purchase Request — KelolaGudang" }],
  }),
  component: EditPurchaseRequest,
});

function EditPurchaseRequest() {
  const { id } = Route.useParams();
  const { data, isLoading, isError } = useProcDoc(Number(id));
  const doc = data?.data;

  if (isLoading) {
    return <EmptyState title="Memuat..." description="Mengambil data dokumen" />;
  }

  if (isError || !doc) {
    return (
      <>
        <Link
          to="/pengadaan/purchase-request"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Kembali ke Purchase Request
        </Link>
        <EmptyState
          title="Dokumen tidak ditemukan"
          description="Purchase Request tidak tersedia di server."
        />
      </>
    );
  }

  if (doc.status !== "Draft") {
    return (
      <>
        <Link
          to="/pengadaan/purchase-request"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Kembali ke Purchase Request
        </Link>
        <EmptyState
          title="Tidak dapat mengedit"
          description={`Dokumen ${doc.no} berstatus ${doc.status} — hanya Draft yang dapat diedit.`}
        />
      </>
    );
  }

  return <PurchaseRequestForm doc={doc} loading={isLoading} />;
}
