import { createFileRoute } from "@tanstack/react-router";
import { PurchaseOrderPage } from "@/components/wms/purchase-order";

export const Route = createFileRoute("/pengadaan/purchase-order")({
  head: () => ({
    meta: [
      { title: "Purchase Order — KelolaGudang" },
      { name: "description", content: "Pesanan pembelian resmi ke supplier." },
      { property: "og:title", content: "Purchase Order — KelolaGudang" },
      { property: "og:description", content: "Pesanan pembelian resmi ke supplier." },
    ],
  }),
  component: PurchaseOrderPage,
});
