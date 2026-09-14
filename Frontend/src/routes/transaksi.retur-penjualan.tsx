import { createFileRoute } from "@tanstack/react-router";
import { ReturPenjualanPage } from "@/components/wms/retur-list";

export const Route = createFileRoute("/transaksi/retur-penjualan")({
  // Deep-link dari GlobalSearch: ?doc=<id> membuka sheet detail dokumen.
  // Key opsional (return {} bila tak ada) agar Link/navigate existing tanpa
  // search tetap lolos typecheck.
  validateSearch: (search: Record<string, unknown>): { doc?: number } => {
    const doc = Number(search["doc"]);
    return Number.isFinite(doc) && doc > 0 ? { doc } : {};
  },
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
