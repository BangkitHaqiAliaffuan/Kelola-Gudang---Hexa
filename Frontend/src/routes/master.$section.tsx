import { createFileRoute } from "@tanstack/react-router";
import { GenericMasterPage, masterDatasets } from "@/components/wms/generic-master";
import {
  BinPage,
  CustomerPage,
  DepartemenPage,
  GudangPage,
  KategoriPage,
  MerkPage,
  ProyekPage,
  RakPage,
  RolePage,
  SatuanPage,
  SubKategoriPage,
  SupplierPage,
  UserPage,
  VendorPage,
  WorkOrderPage,
} from "@/components/wms/master-crud-pages";

const apiTitles: Record<string, { title: string; description: string }> = {
  kategori: { title: "Kategori", description: "Pengelompokan utama barang" },
  "sub-kategori": { title: "Sub Kategori", description: "Turunan dari kategori barang" },
  merk: { title: "Merk", description: "Daftar merk / brand barang" },
  satuan: { title: "Satuan", description: "Daftar satuan (unit of measure) barang" },
  gudang: { title: "Gudang", description: "Daftar lokasi penyimpanan barang" },
  rak: { title: "Rak", description: "Rak penyimpanan per gudang" },
  "bin-location": { title: "Bin Location", description: "Titik penyimpanan terkecil" },
  supplier: { title: "Supplier", description: "Daftar pemasok barang" },
  customer: { title: "Customer", description: "Daftar pembeli / pelanggan" },
  vendor: { title: "Vendor", description: "Daftar penyedia jasa pendukung" },
  departemen: { title: "Departemen", description: "Daftar departemen / divisi" },
  proyek: { title: "Proyek", description: "Daftar proyek pekerjaan" },
  "work-order": { title: "Work Order", description: "Daftar instruksi kerja produksi" },
  user: { title: "User", description: "Pengguna aplikasi gudang" },
};

export const Route = createFileRoute("/master/$section")({
  head: ({ params }) => {
    const ds = masterDatasets[params.section] ?? apiTitles[params.section];
    const title = `${ds?.title ?? "Master Data"} — KelolaGudang`;
    const desc = ds?.description ?? "Kelola master data gudang.";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
      ],
    };
  },
  component: MasterSection,
});

function MasterSection() {
  const { section } = Route.useParams();

  if (section === "kategori") return <KategoriPage />;
  if (section === "sub-kategori") return <SubKategoriPage />;
  if (section === "merk") return <MerkPage />;
  if (section === "satuan") return <SatuanPage />;
  if (section === "gudang") return <GudangPage />;
  if (section === "rak") return <RakPage />;
  if (section === "bin-location") return <BinPage />;
  if (section === "supplier") return <SupplierPage />;
  if (section === "customer") return <CustomerPage />;
  if (section === "vendor") return <VendorPage />;
  if (section === "departemen") return <DepartemenPage />;
  if (section === "proyek") return <ProyekPage />;
  if (section === "work-order") return <WorkOrderPage />;
  if (section === "user") return <UserPage />;
  if (section === "role") return <RolePage />;
  return <GenericMasterPage slug={section} />;
}
