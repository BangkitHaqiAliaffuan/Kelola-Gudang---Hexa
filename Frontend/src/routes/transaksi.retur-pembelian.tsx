import { createFileRoute } from "@tanstack/react-router";
import { ReturPembelianPage } from "@/components/wms/retur-list";

export const Route = createFileRoute("/transaksi/retur-pembelian")({
  head: () => ({
    meta: [
      { title: "Retur Pembelian — KelolaGudang" },
      { name: "description", content: "Catat pengembalian barang ke supplier." },
      { property: "og:title", content: "Retur Pembelian — KelolaGudang" },
      { property: "og:description", content: "Pengembalian barang gudang ke supplier." },
    ],
  }),
  component: ReturPembelianPage,
});
