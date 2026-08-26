import { createFileRoute } from "@tanstack/react-router";
import { TransactionFormPage } from "@/components/wms/transaction-form";
import { trxSections } from "@/lib/trx-sections";
import { transactions } from "@/lib/wms-data";

export const Route = createFileRoute("/transaksi/entri/$section/$id")({
  head: ({ params }) => {
    const cfg = trxSections[params.section];
    const title = `Edit ${cfg?.title ?? "Transaksi"} — KelolaGudang`;
    const desc = `Form perubahan data transaksi ${cfg?.title.toLowerCase() ?? "gudang"}.`;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
      ],
    };
  },
  component: EditTransaksi,
});

function EditTransaksi() {
  const { section, id } = Route.useParams();
  const cfg = trxSections[section] ?? trxSections["masuk"]!;
  const trx = transactions.find((t) => t.id === id);
  return (
    <TransactionFormPage
      variant={cfg.variant}
      title={cfg.title}
      listPath={`/transaksi/${section}`}
      trx={trx}
    />
  );
}
