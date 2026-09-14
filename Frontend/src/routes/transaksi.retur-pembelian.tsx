import { createFileRoute } from "@tanstack/react-router";
import { ReturPembelianPage } from "@/components/wms/retur-list";

export const Route = createFileRoute("/transaksi/retur-pembelian")({
  // Deep-link dari GlobalSearch: ?doc=<id> membuka sheet detail dokumen.
  // Key opsional (return {} bila tak ada) agar Link/navigate existing tanpa
  // search tetap lolos typecheck.
  validateSearch: (search: Record<string, unknown>): { doc?: number } => {
    const doc = Number(search["doc"]);
    return Number.isFinite(doc) && doc > 0 ? { doc } : {};
  },
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
