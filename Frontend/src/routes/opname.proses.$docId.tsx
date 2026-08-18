import { createFileRoute } from "@tanstack/react-router";
import { OpnameCountPage } from "@/components/wms/opname/opname-count-page";

export const Route = createFileRoute("/opname/proses/$docId")({
  head: () => ({
    meta: [
      { title: "Pencatatan Opname — KelolaGudang" },
      { name: "description", content: "Pencatatan fisik satu sesi opname." },
      { property: "og:title", content: "Pencatatan Opname — KelolaGudang" },
      { property: "og:description", content: "Pencatatan fisik satu sesi opname." },
    ],
  }),
  component: OpnameCountRoute,
});

function OpnameCountRoute() {
  const { docId } = Route.useParams();
  return <OpnameCountPage docId={Number(docId)} />;
}
