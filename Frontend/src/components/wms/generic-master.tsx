import { useMemo, useState } from "react";
import { Download, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Panel, Pill } from "./kit";
import { DataTable, type Column } from "./data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { customers, departments, projects, suppliers, workOrders } from "@/lib/wms-data";

type Row = { id: string; kode: string; nama: string; info: string; extra: string; status: string };

function make(prefix: string, list: { nama: string; info: string; extra: string }[]): Row[] {
  return list.map((r, i) => ({
    id: `${prefix}-${i + 1}`,
    kode: `${prefix}-${String(i + 1).padStart(3, "0")}`,
    nama: r.nama,
    info: r.info,
    extra: r.extra,
    status: i % 11 === 5 ? "Nonaktif" : "Aktif",
  }));
}

export const masterDatasets: Record<
  string,
  { title: string; description: string; headers: [string, string, string]; rows: Row[] }
> = {
  supplier: {
    title: "Supplier",
    description: "Mitra pemasok barang",
    headers: ["Nama Supplier", "Kota", "Termin"],
    rows: make(
      "SUP",
      suppliers.map((s) => ({ nama: s.name, info: s.city, extra: s.terms })),
    ),
  },
  customer: {
    title: "Customer",
    description: "Pelanggan penerima barang",
    headers: ["Nama Customer", "Kota", "Segmen"],
    rows: make(
      "CUS",
      customers.map((c) => ({ nama: c.name, info: c.city, extra: c.segment })),
    ),
  },
  vendor: {
    title: "Vendor",
    description: "Vendor jasa dan ekspedisi",
    headers: ["Nama Vendor", "Layanan", "Kontak"],
    rows: make(
      "VDR",
      Array.from({ length: 18 }, (_, i) => ({
        nama: `PT Vendor Logistik ${i + 1}`,
        info: ["Ekspedisi", "Maintenance", "Kalibrasi", "Cleaning"][i % 4]!,
        extra: `0812-${1000 + i}-${2000 + i}`,
      })),
    ),
  },
  departemen: {
    title: "Departemen",
    description: "Unit kerja peminta barang",
    headers: ["Nama Departemen", "Kepala", "Jumlah Permintaan"],
    rows: make(
      "DEP",
      departments.map((d, i) => ({
        nama: d,
        info: ["Bayu Pratama", "Dewi Lestari", "Agus Salim"][i % 3]!,
        extra: `${34 + i * 12} permintaan`,
      })),
    ),
  },
  proyek: {
    title: "Proyek",
    description: "Proyek pemakaian material",
    headers: ["Nama Proyek", "PIC", "Status"],
    rows: make(
      "PRJ",
      projects.map((p, i) => ({
        nama: p,
        info: ["Rudi Hartono", "Siti Aminah"][i % 2]!,
        extra: ["Berjalan", "Selesai", "Perencanaan"][i % 3]!,
      })),
    ),
  },
  "work-order": {
    title: "Work Order",
    description: "Perintah kerja produksi pemakai material",
    headers: ["Nomor WO", "Proyek / Produk", "Target & Jadwal"],
    rows: workOrders.map((w, i) => ({
      id: `WOX-${i + 1}`,
      kode: w.no,
      nama: `${w.no} — ${w.product}`,
      info: w.project,
      extra: `${w.target} ${w.unit} · ${w.start} → ${w.finish}`,
      status: w.status === "Selesai" ? "Selesai" : w.status === "Ditunda" ? "Nonaktif" : "Aktif",
    })),
  },
  user: {
    title: "User",
    description: "Pengguna aplikasi gudang",
    headers: ["Nama User", "Email", "Role"],
    rows: make(
      "USR",
      [
        "Rudi Hartono",
        "Siti Aminah",
        "Bayu Pratama",
        "Dewi Lestari",
        "Agus Salim",
        "Nur Hidayat",
      ].map((n, i) => ({
        nama: n,
        info: `${n.split(" ")[0]!.toLowerCase()}@kelolagudang.id`,
        extra: ["Operator Gudang", "Supervisor", "Admin", "Auditor"][i % 4]!,
      })),
    ),
  },
  role: {
    title: "Role",
    description: "Hak akses pengguna",
    headers: ["Nama Role", "Jumlah User", "Hak Akses"],
    rows: make(
      "ROL",
      ["Administrator", "Supervisor", "Operator Gudang", "Auditor", "Viewer"].map((r, i) => ({
        nama: r,
        info: `${2 + i * 3} user`,
        extra: `${24 - i * 4} modul`,
      })),
    ),
  },
};

export function GenericMasterPage({ slug }: { slug: string }) {
  const ds = masterDatasets[slug];
  const [q, setQ] = useState("");
  const rows = useMemo(
    () =>
      ds
        ? ds.rows.filter((r) =>
            `${r.kode} ${r.nama} ${r.info}`.toLowerCase().includes(q.toLowerCase()),
          )
        : [],
    [ds, q],
  );

  if (!ds) {
    return (
      <PageHeader title="Halaman tidak tersedia" description="Menu ini belum memiliki data." />
    );
  }

  const columns: Column<Row>[] = [
    {
      key: "kode",
      label: "Kode",
      render: (r) => <span className="font-mono text-xs">{r.kode}</span>,
    },
    {
      key: "nama",
      label: ds.headers[0],
      render: (r) => <span className="font-medium">{r.nama}</span>,
    },
    { key: "info", label: ds.headers[1], render: (r) => r.info },
    { key: "extra", label: ds.headers[2], render: (r) => r.extra },
    {
      key: "status",
      label: "Status",
      render: (r) => <Pill tone={r.status === "Aktif" ? "success" : "neutral"}>{r.status}</Pill>,
    },
  ];

  return (
    <>
      <PageHeader
        title={ds.title}
        description={ds.description}
        actions={
          <>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => toast.success("Export berhasil")}
            >
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button
              className="rounded-xl"
              onClick={() => toast.info(`Form tambah ${ds.title} (dummy)`)}
            >
              <Plus className="h-4 w-4" /> Tambah
            </Button>
          </>
        }
      />
      <Panel title={`Daftar ${ds.title}`} description={`${rows.length} data`}>
        <div className="relative mb-4 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Cari ${ds.title.toLowerCase()}...`}
            className="rounded-xl pl-9"
          />
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          pageSize={10}
          mobileCard={(r) => (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{r.nama}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">{r.kode}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {r.info} · {r.extra}
                </p>
              </div>
              <Pill tone={r.status === "Aktif" ? "success" : "neutral"}>{r.status}</Pill>
            </div>
          )}
        />
      </Panel>
    </>
  );
}
