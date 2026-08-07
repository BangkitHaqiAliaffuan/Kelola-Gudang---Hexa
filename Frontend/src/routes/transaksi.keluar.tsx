import { createFileRoute } from "@tanstack/react-router";
import { TransactionPage } from "@/components/wms/transaction-page";

export const Route = createFileRoute("/transaksi/keluar")({
  head: () => ({
    meta: [
      { title: "Barang Keluar — KelolaGudang" },
      { name: "description", content: "Catat pengeluaran barang ke customer, departemen, atau proyek." },
      { property: "og:title", content: "Barang Keluar — KelolaGudang" },
      { property: "og:description", content: "Transaksi pengeluaran barang gudang." },
    ],
  }),
  component: () => (
    <TransactionPage
      variant="keluar"
      type="Barang Keluar"
      section="keluar"
      title="Barang Keluar"
      description="Pengeluaran barang ke customer, produksi, departemen, atau proyek"
    />
  ),
});