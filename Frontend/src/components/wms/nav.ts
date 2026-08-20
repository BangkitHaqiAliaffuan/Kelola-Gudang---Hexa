import {
  LayoutDashboard,
  Package,
  Boxes,
  ArrowLeftRight,
  ClipboardCheck,
  QrCode,
  FileBarChart,
  ShoppingCart,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export type NavChild = { label: string; to: string; module?: string };

export type NavGroup = {
  label: string;
  icon: LucideIcon;
  to?: string;
  /** Backend role.access module that gates this group (defaults to the label). */
  module?: string;
  children?: NavChild[];
};

export const navGroups: NavGroup[] = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/" },
  {
    label: "Master Data",
    icon: Package,
    children: [
      { label: "Barang", to: "/master/barang" },
      { label: "Kategori", to: "/master/kategori" },
      { label: "Sub Kategori", to: "/master/sub-kategori" },
      { label: "Merk", to: "/master/merk" },
      { label: "Satuan", to: "/master/satuan" },
      { label: "Gudang", to: "/master/gudang" },
      { label: "Rak", to: "/master/rak" },
      { label: "Bin Location", to: "/master/bin-location" },
      { label: "Supplier", to: "/master/supplier" },
      { label: "Customer", to: "/master/customer" },
      { label: "Vendor", to: "/master/vendor" },
      { label: "Departemen", to: "/master/departemen" },
      { label: "Proyek", to: "/master/proyek" },
      { label: "Work Order", to: "/master/work-order" },
      { label: "User", to: "/master/user" },
      { label: "Role", to: "/master/role" },
    ],
  },
  {
    label: "Persediaan",
    icon: Boxes,
    children: [
      { label: "Stock Saat Ini", to: "/persediaan/stock" },
      { label: "Kartu Stock", to: "/persediaan/kartu-stock" },
      { label: "Mutasi Stock", to: "/persediaan/mutasi" },
      { label: "Stock Minimum", to: "/persediaan/stock-minimum" },
      { label: "Stock Adjustment", to: "/persediaan/adjustment" },
      { label: "Nilai Persediaan", to: "/persediaan/nilai" },
    ],
  },
  {
    label: "Transaksi",
    icon: ArrowLeftRight,
    children: [
      { label: "Barang Masuk", to: "/transaksi/masuk" },
      { label: "Barang Keluar", to: "/transaksi/keluar" },
      { label: "Transfer Gudang", to: "/transaksi/transfer" },
      { label: "Retur Pembelian", to: "/transaksi/retur-pembelian" },
      { label: "Retur Penjualan", to: "/transaksi/retur-penjualan" },
    ],
  },
  {
    label: "Pengadaan",
    icon: ShoppingCart,
    children: [
      { label: "Purchase Request", to: "/pengadaan/purchase-request" },
      { label: "Purchase Order", to: "/pengadaan/purchase-order" },
      { label: "Receive Goods", to: "/pengadaan/receive-goods" },
    ],
  },
  {
    label: "Stock Opname",
    icon: ClipboardCheck,
    children: [
      { label: "Jadwal", to: "/opname/jadwal" },
      { label: "Proses", to: "/opname/proses" },
      { label: "Laporan", to: "/opname/laporan" },
    ],
  },
  { label: "Barcode", icon: QrCode, to: "/barcode" },
  {
    label: "Laporan",
    icon: FileBarChart,
    children: [
      { label: "Stock", to: "/laporan/stock" },
      { label: "Barang Masuk", to: "/laporan/barang-masuk" },
      { label: "Barang Keluar", to: "/laporan/barang-keluar" },
      { label: "Mutasi", to: "/laporan/mutasi" },
      { label: "Kartu Stock", to: "/laporan/kartu-stock" },
      { label: "Nilai Persediaan", to: "/laporan/nilai-persediaan" },
      { label: "Stock Minimum", to: "/laporan/stock-minimum" },
      { label: "Stock Opname", to: "/laporan/stock-opname" },
      { label: "Dead Stock", to: "/laporan/dead-stock" },
      { label: "Fast Moving Item", to: "/laporan/fast-moving" },
    ],
  },
  {
    label: "System",
    icon: ShieldCheck,
    children: [
      { label: "Audit Trails", to: "/system/audit-trails", module: "Audit Trails" },
      { label: "General Setting", to: "/system/general-setting", module: "System" },
      { label: "Developer", to: "/system/developer", module: "System" },
    ],
  },
];
