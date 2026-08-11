import { useState, type ReactNode } from "react";
import { Check, LogOut, Mail, ShieldCheck, Building2 } from "lucide-react";
import { toast } from "sonner";
import { Pill } from "./kit";
import { themes, useTheme } from "./theme";
import type { AuthUser } from "@/lib/auth-api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const tutorials = [
  {
    q: "Memulai: alur kerja harian",
    a: "Mulai dari Dashboard untuk melihat ringkasan stok dan notifikasi. Lanjutkan ke Transaksi untuk mencatat barang masuk/keluar, lalu pantau posisi stok pada menu Persediaan.",
  },
  {
    q: "Mencatat barang masuk",
    a: "Buka Transaksi → Barang Masuk → tombol Buat. Form terbuka pada halaman penuh: isi gudang, supplier, referensi PO, lalu tambahkan baris barang beserta qty dan satuannya sebelum menyimpan.",
  },
  {
    q: "Alur pengadaan (PR → PO → Receive)",
    a: "Purchase Request dibuat oleh departemen pemohon, disetujui, lalu dikonversi menjadi Purchase Order untuk supplier. Barang yang datang dicatat pada Receive Goods dengan mengacu ke nomor PO.",
  },
  {
    q: "Membaca Kartu Stock & nilai persediaan",
    a: "Kartu Stock menampilkan saldo awal, mutasi masuk/keluar, dan saldo akhir per barang lengkap dengan satuan. Nilai persediaan dapat dibandingkan dengan metode FIFO, Average, dan Estimasi Maksimum.",
  },
  {
    q: "Menjalankan Stock Opname",
    a: "Buat rencana pada menu Jadwal, jalankan pencatatan fisik pada menu Proses (scan atau input qty fisik), lalu tinjau ringkasan selisih pada menu Laporan.",
  },
  {
    q: "Cetak barcode & label",
    a: "Menu Barcode menyediakan generator barcode/QR dengan berbagai ukuran label, dari 30x20 mm sampai lembar A4.",
  },
  {
    q: "Pintasan keyboard",
    a: "Tekan Ctrl/⌘ + K untuk membuka pencarian global: barang, SKU, barcode, nomor transaksi, gudang, dan supplier.",
  },
];

function Row({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}

export function ProfileHelpDialog({
  trigger,
  user,
  onLogout,
}: {
  trigger: ReactNode;
  user?: AuthUser | undefined;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  const name = user?.name ?? "Pengguna";
  const role = user?.role ?? "";
  const email = user?.email ?? "";
  const initials =
    name
      .split(" ")
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[88vh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-5 py-4 text-left">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-primary-soft text-sm font-bold text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <DialogTitle className="truncate text-base">{name}</DialogTitle>
              <DialogDescription className="truncate text-xs">
                {role} · Gudang Pusat Jakarta
              </DialogDescription>
            </div>
            <Pill tone="success" className="ml-auto hidden sm:inline-flex">
              Aktif
            </Pill>
          </div>
        </DialogHeader>

        <Tabs defaultValue="profil" className="w-full">
          <div className="px-5 pt-4">
            <TabsList className="grid w-full grid-cols-3 rounded-xl">
              <TabsTrigger value="profil" className="rounded-lg">
                Profil
              </TabsTrigger>
              <TabsTrigger value="preferensi" className="rounded-lg">
                Preferensi
              </TabsTrigger>
              <TabsTrigger value="tutorial" className="rounded-lg">
                Bantuan
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="max-h-[52vh]">
            <TabsContent value="profil" className="space-y-3 px-5 py-4">
              <div className="grid gap-2.5 sm:grid-cols-2">
                <Row icon={Mail} label="Email" value={email} />
                <Row icon={ShieldCheck} label="Role" value={role} />
                <Row icon={Building2} label="Perusahaan" value="PT Kelola Nusantara" />
              </div>
              <div className="rounded-xl border border-border p-3">
                <p className="text-xs font-semibold text-muted-foreground">Hak Akses</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {["Transaksi", "Persediaan", "Opname", "Barcode", "Laporan"].map((p) => (
                    <Pill key={p} tone="brand">
                      {p}
                    </Pill>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="preferensi" className="space-y-4 px-5 py-4">
              <div>
                <p className="mb-2 text-xs font-semibold text-muted-foreground">Tema Pastel</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {themes.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTheme(t.id)}
                      className={cn(
                        "flex items-center gap-2 rounded-xl border px-2.5 py-2 text-xs font-medium transition-colors hover:bg-accent",
                        theme === t.id ? "border-primary/40 bg-primary-soft" : "border-border",
                      )}
                    >
                      <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: t.swatch }} />
                      <span className="truncate">{t.label}</span>
                      {theme === t.id && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                {[
                  ["Notifikasi stok minimum", true],
                  ["Ringkasan harian via email", false],
                  ["Mode tabel padat", false],
                ].map(([label, def]) => (
                  <div
                    key={label as string}
                    className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5"
                  >
                    <Label className="text-sm font-medium">{label as string}</Label>
                    <Switch defaultChecked={def as boolean} />
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="tutorial" className="px-5 py-4">
              <Accordion type="single" collapsible className="w-full">
                {tutorials.map((t, i) => (
                  <AccordionItem key={t.q} value={`t-${i}`}>
                    <AccordionTrigger className="text-left text-sm">{t.q}</AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground">{t.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => {
              setOpen(false);
              toast.success("Perubahan preferensi disimpan");
            }}
          >
            Simpan
          </Button>
          <Button
            variant="ghost"
            className="rounded-xl text-destructive hover:text-destructive"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            <LogOut className="h-4 w-4" />
            Keluar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
