import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { BarangKeluarForm } from "@/components/wms/barang-keluar-form";
import { BarangMasukForm } from "@/components/wms/barang-masuk-form";
import { ReturPembelianForm } from "@/components/wms/retur-pembelian-form";
import { ReturPenjualanForm } from "@/components/wms/retur-penjualan-form";
import { TransferGudangForm } from "@/components/wms/transfer-gudang-form";
import { TransactionFormPage } from "@/components/wms/transaction-form";
import { PageHeader } from "@/components/wms/kit";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { trxSections } from "@/lib/trx-sections";

/** Modul backend yang mengatur level tulis form entri per section. */
const sectionModule: Record<string, string> = {
  masuk: "Persediaan",
  keluar: "Persediaan",
  transfer: "Persediaan",
  "retur-pembelian": "Persediaan",
  "retur-penjualan": "Persediaan",
  peminjaman: "Transaksi",
  pengembalian: "Transaksi",
};

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

function NoWriteAccess({ section }: { section: string }) {
  return (
    <>
      <PageHeader
        title="Akses dibatasi"
        description="Role Anda hanya memiliki akses baca untuk modul ini."
      />
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Anda tidak dapat membuat transaksi{" "}
          <b>{trxSections[section]?.title.toLowerCase() ?? "gudang"}</b>.
        </p>
        <Button asChild variant="outline" className="mt-4 rounded-xl">
          <Link to="/transaksi/$section" params={{ section }}>
            <ArrowLeft className="h-4 w-4" /> Kembali ke Daftar
          </Link>
        </Button>
      </div>
    </>
  );
}

function TambahTransaksi() {
  const { section } = Route.useParams();
  const { hasModuleLevel } = useAuth();
  const module = sectionModule[section] ?? "Transaksi";
  const canCreate = hasModuleLevel(module, "Tulis");
  const cfg = trxSections[section] ?? trxSections["masuk"]!;

  if (!canCreate) {
    return <NoWriteAccess section={section} />;
  }

  if (section === "masuk") {
    return <BarangMasukForm />;
  }

  if (section === "keluar") {
    return <BarangKeluarForm />;
  }

  if (section === "transfer") {
    return <TransferGudangForm />;
  }

  if (section === "retur-pembelian") {
    return <ReturPembelianForm />;
  }

  if (section === "retur-penjualan") {
    return <ReturPenjualanForm />;
  }

  return (
    <TransactionFormPage
      variant={cfg.variant}
      title={cfg.title}
      listPath={`/transaksi/${section}`}
    />
  );
}
