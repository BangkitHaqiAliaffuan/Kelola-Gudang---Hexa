import type { TrxType } from "@/lib/wms-data";

export type SectionConfig = {
  title: string;
  type: TrxType;
  description: string;
  variant: "masuk" | "keluar" | "transfer";
};

export const trxSections: Record<string, SectionConfig> = {
  masuk: {
    title: "Barang Masuk",
    type: "Barang Masuk",
    description: "Penerimaan barang dari supplier",
    variant: "masuk",
  },
  keluar: {
    title: "Barang Keluar",
    type: "Barang Keluar",
    description: "Pengeluaran barang ke customer, produksi, departemen, atau proyek",
    variant: "keluar",
  },
  transfer: {
    title: "Transfer Gudang",
    type: "Transfer Gudang",
    description: "Perpindahan stok antar gudang",
    variant: "transfer",
  },
  "retur-pembelian": {
    title: "Retur Pembelian",
    type: "Retur Pembelian",
    description: "Pengembalian barang ke supplier",
    variant: "keluar",
  },
  "retur-penjualan": {
    title: "Retur Penjualan",
    type: "Retur Penjualan",
    description: "Penerimaan barang retur dari customer",
    variant: "masuk",
  },
};
