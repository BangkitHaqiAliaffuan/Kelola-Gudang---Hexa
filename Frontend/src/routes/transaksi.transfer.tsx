import { createFileRoute } from "@tanstack/react-router";
import { TransactionPage } from "@/components/wms/transaction-page";

export const Route = createFileRoute("/transaksi/transfer")({
  head: () => ({
    meta: [
      { title: "Transfer Gudang — KelolaGudang" },
      { name: "description", content: "Pindahkan stok antar gudang lengkap dengan timeline status." },
      { property: "og:title", content: "Transfer Gudang — KelolaGudang" },
      { property: "og:description", content: "Mutasi barang antar lokasi penyimpanan." },
    ],
  }),
  component: () => (
    <TransactionPage
      variant="transfer"
      type="Transfer Gudang"
      section="transfer"
      title="Transfer Gudang"
      description="Perpindahan stok antar gudang"
    />
  ),
});