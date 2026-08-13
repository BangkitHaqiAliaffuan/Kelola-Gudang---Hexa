import { createFileRoute } from "@tanstack/react-router";
import { PurchaseOrderForm } from "@/components/wms/purchase-order-form";

export const Route = createFileRoute("/pengadaan/purchase-order/edit/$id")({
  head: () => ({
    meta: [
      { title: "Edit Purchase Order — KelolaGudang" },
      { name: "description", content: "Ubah draft Purchase Order." },
    ],
  }),
  component: EditPurchaseOrder,
});

function EditPurchaseOrder() {
  const { id } = Route.useParams();
  return <PurchaseOrderForm mode="edit" id={Number(id)} />;
}
