import { createFileRoute } from "@tanstack/react-router";
import { BarangMasukForm } from "@/components/wms/barang-masuk-form";
import { TransactionFormPage } from "@/components/wms/transaction-form";
import { trxSections } from "@/lib/trx-sections";

export const Route = createFileRoute("/transaksi/entri/$section")({
  head: ({ params }) => {
    const cfg = trxSections[params.section];
    const title = `Tambah ${cfg?.title ?? "Transaksi"} — KelolaGudang`;
    const desc = `Form pembuatan transaksi ${cfg?.title.toLowerCase() ?? "gudang"}.`;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
      ],
    };
  },
  component: TambahTransaksi,
});

function TambahTransaksi() {
  const { section } = Route.useParams();
  const cfg = trxSections[section] ?? trxSections["masuk"]!;

  if (section === "masuk") {
    return <BarangMasukForm />;
  }

  return (
    <TransactionFormPage
      variant={cfg.variant}
      title={cfg.title}
      listPath={`/transaksi/${section}`}
    />
  );
}
