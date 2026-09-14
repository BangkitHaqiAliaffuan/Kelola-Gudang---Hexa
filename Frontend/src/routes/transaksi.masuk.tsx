import { createFileRoute } from "@tanstack/react-router";
import { BarangMasukPage } from "@/components/wms/transaksi-masuk";

export const Route = createFileRoute("/transaksi/masuk")({
  // Deep-link dari GlobalSearch: ?doc=<id> membuka sheet detail dokumen.
  // Key opsional (return {} bila tak ada) agar Link/navigate existing tanpa
  // search tetap lolos typecheck.
  validateSearch: (search: Record<string, unknown>): { doc?: number } => {
    const doc = Number(search["doc"]);
    return Number.isFinite(doc) && doc > 0 ? { doc } : {};
  },
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
