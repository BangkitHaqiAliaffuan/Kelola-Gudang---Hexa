import { createFileRoute } from "@tanstack/react-router";
import { PurchaseOrderForm } from "@/components/wms/purchase-order-form";

export const Route = createFileRoute("/pengadaan/purchase-order/new")({
  head: () => ({
    meta: [
      { title: "Buat Purchase Order — KelolaGudang" },
      { name: "description", content: "Pesanan pembelian resmi ke supplier." },
    ],
  }),
  component: () => <PurchaseOrderForm mode="new" />,
});
