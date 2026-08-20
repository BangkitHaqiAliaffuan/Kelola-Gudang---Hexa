import { createFileRoute } from "@tanstack/react-router";
import { OpnameDetailPage } from "@/components/wms/opname/opname-detail-page";

export const Route = createFileRoute("/opname/laporan/$docId")({
  head: () => ({
    meta: [
      { title: "Detail Opname — KelolaGudang" },
      { name: "description", content: "Detail selisih satu sesi opname." },
      { property: "og:title", content: "Detail Opname — KelolaGudang" },
      { property: "og:description", content: "Detail selisih satu sesi opname." },
    ],
  }),
  component: OpnameDetailRoute,
});

function OpnameDetailRoute() {
  const { docId } = Route.useParams();
  return <OpnameDetailPage docId={Number(docId)} />;
}
