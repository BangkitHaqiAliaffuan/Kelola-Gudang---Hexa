import { createFileRoute } from "@tanstack/react-router";
import { TransactionPage } from "@/components/wms/transaction-page";
import { trxSections } from "@/lib/trx-sections";

export const Route = createFileRoute("/transaksi/$section")({
  head: ({ params }) => {
    const cfg = trxSections[params.section];
    const title = `${cfg?.title ?? "Transaksi"} — KelolaGudang`;
    const desc = cfg?.description ?? "Transaksi gudang.";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
      ],
    };
  },
  component: TransaksiSection,
});

function TransaksiSection() {
  const { section } = Route.useParams();
  const cfg = trxSections[section] ?? trxSections["masuk"]!;
  return (
    <TransactionPage
      variant={cfg.variant}
      type={cfg.type}
      title={cfg.title}
      description={cfg.description}
      section={section}
    />
  );
}