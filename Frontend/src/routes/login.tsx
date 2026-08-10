import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, LogIn, ShieldCheck, Boxes, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/wms/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { fieldError, isApiError } from "@/lib/api";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Masuk — KelolaGudang WMS" },
      {
        name: "description",
        content:
          "Masuk ke KelolaGudang untuk mengelola stok, transaksi gudang, pengadaan, dan stock opname.",
      },
      { property: "og:title", content: "Masuk — KelolaGudang WMS" },
      {
        property: "og:description",
        content: "Halaman masuk sistem manajemen gudang KelolaGudang.",
      },
    ],
  }),
  component: LoginPage,
});

const highlights = [
  { icon: Boxes, title: "Stok real-time", desc: "Pantau saldo, reserved, dan available per gudang." },
  { icon: ShieldCheck, title: "Audit trail", desc: "Setiap aktivitas tercatat rapi dan dapat ditelusuri." },
  { icon: BarChart3, title: "Laporan lengkap", desc: "Mutasi, nilai persediaan, dead stock, fast moving." },
];

function LoginPage() {
  const navigate = useNavigate();
  const { login, status } = useAuth();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (status === "authenticated") navigate({ to: "/" });
  }, [status, navigate]);

  if (status === "loading") {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Berhasil masuk. Selamat datang kembali!");
      navigate({ to: "/" });
    } catch (err) {
      if (isApiError(err)) {
        const msg = fieldError(err, "email") ?? err.message;
        toast.error(msg);
      } else {
        toast.error("Terjadi kesalahan. Coba lagi.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-2">
      <div
        className="relative hidden flex-col justify-between p-10 text-primary-foreground lg:flex"
        style={{ backgroundImage: "var(--gradient-primary)" }}
      >
        <div className="[&_span]:text-primary-foreground">
          <Logo />
        </div>
        <div className="max-w-md space-y-6">
          <h2 className="text-3xl font-extrabold leading-tight tracking-tight">
            Kelola gudang Anda dengan tenang dan rapi.
          </h2>
          <div className="space-y-3">
            {highlights.map((h) => (
              <div key={h.title} className="flex items-start gap-3 rounded-2xl bg-white/12 p-3.5 backdrop-blur-sm">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/20">
                  <h.icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{h.title}</p>
                  <p className="text-xs opacity-85">{h.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs opacity-80">© 2026 KelolaGudang · Warehouse Management System</p>
      </div>

      <div className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Masuk ke akun Anda</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Gunakan akun operasional gudang untuk melanjutkan.
          </p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                className="h-11 rounded-xl"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Kata Sandi</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  className="h-11 rounded-xl pr-11"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => toast.info("Hubungi administrator untuk reset kata sandi.")}
                className="text-sm font-medium text-primary hover:underline"
              >
                Lupa sandi?
              </button>
            </div>

            <Button type="submit" className="h-11 w-full rounded-xl" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              {loading ? "Memproses..." : "Masuk"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
