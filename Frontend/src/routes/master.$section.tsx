import { createFileRoute } from "@tanstack/react-router";
import { GenericMasterPage, masterDatasets } from "@/components/wms/generic-master";
import {
  GudangPage,
  KategoriPage,
  MerkPage,
  SatuanPage,
  SubKategoriPage,
} from "@/components/wms/master-crud-pages";

const apiTitles: Record<string, { title: string; description: string }> = {
  kategori: { title: "Kategori", description: "Pengelompokan utama barang" },
  "sub-kategori": { title: "Sub Kategori", description: "Turunan dari kategori barang" },
  merk: { title: "Merk", description: "Daftar merk / brand barang" },
  satuan: { title: "Satuan", description: "Daftar satuan (unit of measure) barang" },
  gudang: { title: "Gudang", description: "Daftar lokasi penyimpanan barang" },
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
  return <GenericMasterPage slug={section} />;
}
