import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageHeader, Panel } from "@/components/wms/kit";
import { themes, useTheme } from "@/components/wms/theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/pengaturan")({
  head: () => ({
    meta: [
      { title: "Pengaturan — KelolaGudang" },
      {
        name: "description",
        content: "Atur profil perusahaan, tema pastel, dan preferensi operasional gudang.",
      },
      { property: "og:title", content: "Pengaturan — KelolaGudang" },
      { property: "og:description", content: "Personalisasi aplikasi gudang Anda." },
    ],
  }),
  component: Pengaturan,
});

function Pengaturan() {
  const { theme, setTheme } = useTheme();
  const { hasModuleLevel } = useAuth();
  const canWrite = hasModuleLevel("System", "Tulis");
  return (
    <>
      <PageHeader title="Pengaturan" description="Preferensi aplikasi dan tampilan" />

      <Panel title="Tema Pastel" description="Pilih warna yang nyaman untuk penggunaan harian">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {themes.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
              className={cn(
                "flex items-center gap-3 rounded-xl border p-3 text-left text-sm font-medium transition-all hover:-translate-y-0.5",
                theme === t.id ? "border-primary/40 bg-primary-soft" : "border-border bg-card",
              )}
            >
              <span className="h-8 w-8 shrink-0 rounded-lg" style={{ background: t.swatch }} />
              <span className="truncate">{t.label}</span>
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Profil Perusahaan">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Nama Perusahaan</Label>
            <Input
              defaultValue="PT Kelola Gudang Nusantara"
              readOnly={!canWrite}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Kode Perusahaan</Label>
            <Input defaultValue="KGN-001" readOnly={!canWrite} className="rounded-xl" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Alamat</Label>
            <Input
              defaultValue="Jl. Industri Raya No. 88, Jakarta Timur"
              readOnly={!canWrite}
              className="rounded-xl"
            />
          </div>
        </div>
      </Panel>

      <Panel title="Preferensi Operasional">
        <div className="space-y-4">
          {[
            ["Notifikasi stok menipis", "Kirim peringatan saat stok di bawah minimum"],
            ["Approval transaksi keluar", "Wajib persetujuan supervisor"],
            ["Scan barcode otomatis", "Fokus input langsung ke kolom scan"],
            ["Cetak label setelah simpan", "Otomatis cetak label barang baru"],
          ].map(([title, desc], i) => (
            <div
              key={title}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{title}</p>
                <p className="truncate text-xs text-muted-foreground">{desc}</p>
              </div>
              <Switch defaultChecked={i !== 3} disabled={!canWrite} />
            </div>
          ))}
        </div>
        {canWrite && (
          <div className="mt-4 flex justify-end">
            <Button className="rounded-xl" onClick={() => toast.success("Pengaturan disimpan")}>
              Simpan Perubahan
            </Button>
          </div>
        )}
      </Panel>
    </>
  );
}
