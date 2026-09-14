import { createFileRoute } from "@tanstack/react-router";
import { BarangKeluarPage } from "@/components/wms/transaksi-keluar";

export const Route = createFileRoute("/transaksi/keluar")({
  // Deep-link dari GlobalSearch: ?doc=<id> membuka sheet detail dokumen.
  // Key opsional (return {} bila tak ada) agar Link/navigate existing tanpa
  // search tetap lolos typecheck.
  validateSearch: (search: Record<string, unknown>): { doc?: number } => {
    const doc = Number(search["doc"]);
    return Number.isFinite(doc) && doc > 0 ? { doc } : {};
  },
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
