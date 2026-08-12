import { createFileRoute } from "@tanstack/react-router";
import { BarangMasukPage } from "@/components/wms/transaksi-masuk";

export const Route = createFileRoute("/transaksi/masuk")({
  head: () => ({
    meta: [
      { title: "Barang Masuk — KelolaGudang" },
      { name: "description", content: "Catat penerimaan barang dari supplier." },
      { property: "og:title", content: "Barang Masuk — KelolaGudang" },
      { property: "og:description", content: "Penerimaan barang gudang dari supplier." },
    ],
  }),
  component: BarangMasukPage,
});
