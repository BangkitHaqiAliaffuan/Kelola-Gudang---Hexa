import { createFileRoute } from "@tanstack/react-router";
import { OpnameJadwalPage } from "@/components/wms/opname/opname-jadwal";
import { OpnameLaporanPage } from "@/components/wms/opname/opname-laporan";
import { OpnameProsesPage } from "@/components/wms/opname/opname-proses";

const sections: Record<string, { title: string; description: string }> = {
  jadwal: { title: "Jadwal Opname", description: "Rencana pelaksanaan dan status penyelesaian" },
  proses: {
    title: "Proses Opname",
    description: "Aktivitas mulai, pencatatan fisik, sampai selesai",
  },
  laporan: { title: "Laporan Opname", description: "Ringkasan dan detail hasil tiap sesi opname" },
};

export const Route = createFileRoute("/opname/$section")({
  head: ({ params }) => {
    const cfg = sections[params.section] ?? sections["jadwal"]!;
    const title = `${cfg.title} — KelolaGudang`;
    return {
      meta: [
        { title },
        { name: "description", content: cfg.description },
        { property: "og:title", content: title },
        { property: "og:description", content: cfg.description },
      ],
    };
  },
  component: Opname,
});

function Opname() {
  const { section } = Route.useParams();

  switch (section) {
    case "proses":
      return <OpnameProsesPage />;
    case "laporan":
      return <OpnameLaporanPage />;
    case "jadwal":
    default:
      return <OpnameJadwalPage />;
  }
}
