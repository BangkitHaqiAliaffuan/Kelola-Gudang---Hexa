import { createFileRoute } from "@tanstack/react-router";
import { ReceiveGoodsPage } from "@/components/wms/receive-goods";

export const Route = createFileRoute("/pengadaan/receive-goods/")({
  head: () => ({
    meta: [
      { title: "Receive Goods — KelolaGudang" },
      { name: "description", content: "Penerimaan barang berdasarkan Purchase Order." },
      { property: "og:title", content: "Receive Goods — KelolaGudang" },
      { property: "og:description", content: "Penerimaan barang dari PO di gudang." },
    ],
  }),
  component: ReceiveGoodsPage,
});
