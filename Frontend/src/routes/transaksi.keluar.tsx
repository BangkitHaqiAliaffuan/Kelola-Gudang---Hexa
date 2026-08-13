import { createFileRoute } from "@tanstack/react-router";
import { BarangKeluarPage } from "@/components/wms/transaksi-keluar";

export const Route = createFileRoute("/transaksi/keluar")({
  head: () => ({
    meta: [
      { title: "Barang Keluar — KelolaGudang" },
      {
        name: "description",
        content: "Catat pengeluaran barang ke customer, departemen, atau proyek.",
      },
      { property: "og:title", content: "Barang Keluar — KelolaGudang" },
      { property: "og:description", content: "Transaksi pengeluaran barang gudang." },
    ],
  }),
  component: BarangKeluarPage,
});
