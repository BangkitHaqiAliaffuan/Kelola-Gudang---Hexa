import { createFileRoute } from "@tanstack/react-router";
import { PurchaseRequestForm } from "@/components/wms/purchase-request-form";

export const Route = createFileRoute("/pengadaan/purchase-request/new")({
  head: () => ({
    meta: [{ title: "Buat Purchase Request — KelolaGudang" }],
  }),
  component: () => <PurchaseRequestForm doc={null} />,
});
