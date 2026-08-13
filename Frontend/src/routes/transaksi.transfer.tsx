import { createFileRoute } from "@tanstack/react-router";
import { TransferGudangPage } from "@/components/wms/transaksi-transfer";

export const Route = createFileRoute("/transaksi/transfer")({
  head: () => ({
    meta: [
      { title: "Transfer Gudang — KelolaGudang" },
      {
        name: "description",
        content: "Pindahkan stok antar gudang lengkap dengan timeline status.",
      },
      { property: "og:title", content: "Transfer Gudang — KelolaGudang" },
      { property: "og:description", content: "Mutasi barang antar lokasi penyimpanan." },
    ],
  }),
  component: TransferGudangPage,
});
