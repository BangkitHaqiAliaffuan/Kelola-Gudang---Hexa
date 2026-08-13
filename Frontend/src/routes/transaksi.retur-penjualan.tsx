import { createFileRoute } from "@tanstack/react-router";
import { ReturPenjualanPage } from "@/components/wms/retur-list";

export const Route = createFileRoute("/transaksi/retur-penjualan")({
  head: () => ({
    meta: [
      { title: "Retur Penjualan — KelolaGudang" },
      { name: "description", content: "Catat penerimaan barang retur dari customer." },
      { property: "og:title", content: "Retur Penjualan — KelolaGudang" },
      { property: "og:description", content: "Penerimaan barang retur dari customer." },
    ],
  }),
  component: ReturPenjualanPage,
});
