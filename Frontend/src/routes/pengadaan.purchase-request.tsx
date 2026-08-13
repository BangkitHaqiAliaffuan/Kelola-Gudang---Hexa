import { createFileRoute } from "@tanstack/react-router";
import { PurchaseRequestPage } from "@/components/wms/purchase-request";

export const Route = createFileRoute("/pengadaan/purchase-request")({
  head: () => ({
    meta: [
      { title: "Purchase Request — KelolaGudang" },
      {
        name: "description",
        content: "Permintaan pembelian barang dari departemen.",
      },
      { property: "og:title", content: "Purchase Request — KelolaGudang" },
      { property: "og:description", content: "Permintaan pembelian barang gudang." },
    ],
  }),
  component: PurchaseRequestPage,
});
