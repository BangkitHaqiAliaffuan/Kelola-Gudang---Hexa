import { createFileRoute } from "@tanstack/react-router";
import { TransferGudangPage } from "@/components/wms/transaksi-transfer";

export const Route = createFileRoute("/transaksi/transfer")({
  // Deep-link dari GlobalSearch: ?doc=<id> membuka sheet detail dokumen.
  // Key opsional (return {} bila tak ada) agar Link/navigate existing tanpa
  // search tetap lolos typecheck.
  validateSearch: (search: Record<string, unknown>): { doc?: number } => {
    const doc = Number(search["doc"]);
    return Number.isFinite(doc) && doc > 0 ? { doc } : {};
  },
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
