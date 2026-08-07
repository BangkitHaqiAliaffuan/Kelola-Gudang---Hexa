import { createFileRoute } from "@tanstack/react-router";
import { TransactionPage } from "@/components/wms/transaction-page";

export const Route = createFileRoute("/transaksi/masuk")({
  head: () => ({
    meta: [
      { title: "Barang Masuk — KelolaGudang" },
      { name: "description", content: "Catat penerimaan barang dari supplier dengan scan barcode." },
      { property: "og:title", content: "Barang Masuk — KelolaGudang" },
      { property: "og:description", content: "Transaksi penerimaan barang gudang." },
    ],
  }),
  component: () => (
    <TransactionPage
      variant="masuk"
      type="Barang Masuk"
      section="masuk"
      title="Barang Masuk"
      description="Penerimaan barang dari supplier"
    />
  ),
});