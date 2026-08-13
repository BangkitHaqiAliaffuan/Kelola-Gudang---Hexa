import { Link, useRouterState, useNavigate, useMatches } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bell,
  ChevronDown,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  Plus,
  Palette,
  LayoutDashboard,
  Package,
  Boxes,
  ArrowLeftRight,
  ClipboardCheck,
  ArrowDownToLine,
  ArrowUpFromLine,
  QrCode,
  Check,
  Loader2,
} from "lucide-react";
import { navGroups } from "./nav";
import { Logo, Pill } from "./kit";
import { ProfileHelpDialog } from "./profile-dialog";
import { themes, useTheme } from "./theme";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { items, suppliers, transactions, warehouses, notifications } from "@/lib/wms-data";
import { toast } from "sonner";

type QuickAction = { label: string; to: string; icon: typeof Package; module?: string };

const quickActions: QuickAction[] = [
  { label: "Barang Masuk", to: "/transaksi/masuk", icon: ArrowDownToLine, module: "Transaksi" },
  { label: "Barang Keluar", to: "/transaksi/keluar", icon: ArrowUpFromLine, module: "Transaksi" },
  { label: "Transfer", to: "/transaksi/transfer", icon: ArrowLeftRight, module: "Transaksi" },
  { label: "Stock Opname", to: "/opname/proses", icon: ClipboardCheck, module: "Stock Opname" },
  { label: "Cetak Barcode", to: "/barcode", icon: QrCode },
  { label: "Tambah Barang", to: "/master/barang", icon: Package, module: "Master Data" },
];

const bottomNav: QuickAction[] = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard },
  { label: "Barang", to: "/master/barang", icon: Package, module: "Master Data" },
  { label: "Stock", to: "/persediaan/stock", icon: Boxes, module: "Persediaan" },
  { label: "Opname", to: "/opname/proses", icon: ClipboardCheck, module: "Stock Opname" },
];

/** Prefix → backend role.access module; most-specific first. Empty = public (no gate). */
const routeModuleMap: { prefix: string; module: string }[] = [
  { prefix: "/master", module: "Master Data" },
  { prefix: "/persediaan", module: "Persediaan" },
  { prefix: "/transaksi", module: "Transaksi" },
  { prefix: "/pengadaan", module: "Pengadaan" },
  { prefix: "/opname", module: "Stock Opname" },
  { prefix: "/laporan", module: "Laporan" },
  { prefix: "/system/audit-trails", module: "Audit Trails" },
  { prefix: "/system", module: "System" },
];

function moduleForPath(pathname: string): string | null {
  return (
    routeModuleMap.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`))
      ?.module ?? null
  );
}

function SidebarNav({
  collapsed,
  onNavigate,
  visibleGroups,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
  visibleGroups: typeof navGroups;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState<string[]>(() =>
    visibleGroups
      .filter((g) =>
        g.children?.some((c) =>
          pathname.startsWith(c.to.split("/")[1] ? `/${c.to.split("/")[1]}` : c.to),
        ),
      )
      .map((g) => g.label),
  );

  const toggle = (label: string) =>
    setOpen((p) => (p.includes(label) ? p.filter((l) => l !== label) : [...p, label]));

  return (
    <ScrollArea className="h-full px-3 py-4">
      <nav className="space-y-1">
        {visibleGroups.map((group) => {
          const Icon = group.icon;
          if (group.to) {
            const active = pathname === group.to;
            return (
              <Link
                key={group.label}
                to={group.to}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
                  collapsed && "justify-center px-0",
                )}
                title={group.label}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span className="truncate">{group.label}</span>}
              </Link>
            );
          }
          const isOpen = open.includes(group.label) && !collapsed;
          const groupActive = group.children?.some((c) => pathname === c.to);
          return (
            <div key={group.label}>
              <button
                type="button"
                onClick={() => (collapsed ? undefined : toggle(group.label))}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  groupActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
                  collapsed && "justify-center px-0",
                )}
                title={group.label}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && (
                  <>
                    <span className="min-w-0 flex-1 truncate text-left">{group.label}</span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 transition-transform duration-200",
                        isOpen && "rotate-180",
                      )}
                    />
                  </>
                )}
              </button>
              {isOpen && (
                <div className="ml-[22px] animate-fade-in space-y-0.5 border-l border-sidebar-border pl-3 pt-1">
                  {group.children!.map((child) => {
                    const active = pathname === child.to;
                    return (
                      <Link
                        key={child.label + child.to}
                        to={child.to}
                        onClick={onNavigate}
                        className={cn(
                          "block truncate rounded-lg px-3 py-2 text-[13px] transition-colors",
                          active
                            ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                            : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
                        )}
                      >
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div className="h-24" />
    </ScrollArea>
  );
}

function GlobalSearch({
  open,
  setOpen,
  visibleQuickActions,
  canAccess,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  visibleQuickActions: QuickAction[];
  canAccess: (module: string) => boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!open);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Cari barang, SKU, barcode, supplier, gudang, nomor transaksi..." />
      <CommandList>
        <CommandEmpty>Tidak ada hasil ditemukan.</CommandEmpty>
        <CommandGroup heading="Aksi Cepat">
          {visibleQuickActions.map((a) => (
            <CommandItem key={a.label} value={a.label} onSelect={() => setOpen(false)} asChild>
              <Link to={a.to}>
                <a.icon className="h-4 w-4" />
                {a.label}
              </Link>
            </CommandItem>
          ))}
        </CommandGroup>
        {canAccess("Master Data") && (
          <CommandGroup heading="Barang / SKU / Barcode">
            {items.slice(0, 24).map((it) => (
              <CommandItem
                key={it.id}
                value={`${it.name} ${it.sku} ${it.barcode}`}
                onSelect={() => setOpen(false)}
                asChild
              >
                <Link to="/master/barang/$id" params={{ id: it.id }}>
                  <Package className="h-4 w-4" />
                  <span className="truncate">{it.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{it.sku}</span>
                </Link>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {canAccess("Transaksi") && (
          <CommandGroup heading="Nomor Transaksi">
            {transactions.slice(0, 8).map((t) => (
              <CommandItem key={t.id} value={t.no} onSelect={() => setOpen(false)}>
                <ArrowLeftRight className="h-4 w-4" />
                {t.no}
                <span className="ml-auto text-xs text-muted-foreground">{t.type}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {canAccess("Master Data") && (
          <>
            <CommandGroup heading="Gudang">
              {warehouses.map((w) => (
                <CommandItem key={w.id} value={w.name} onSelect={() => setOpen(false)}>
                  <Boxes className="h-4 w-4" />
                  {w.name}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Supplier">
              {suppliers.slice(0, 8).map((s) => (
                <CommandItem key={s.id} value={s.name} onSelect={() => setOpen(false)}>
                  <Package className="h-4 w-4" />
                  {s.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

function ThemePicker() {
  const { theme, setTheme } = useTheme();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-xl" aria-label="Ganti tema">
          <Palette className="h-[18px] w-[18px]" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 rounded-xl p-3">
        <p className="mb-2 text-xs font-semibold text-muted-foreground">Pastel Theme</p>
        <div className="grid grid-cols-2 gap-1.5">
          {themes.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-2 py-2 text-xs font-medium transition-colors hover:bg-accent",
                theme === t.id ? "border-primary/40 bg-primary-soft" : "border-border",
              )}
            >
              <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: t.swatch }} />
              <span className="truncate">{t.label}</span>
              {theme === t.id && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NotificationCenter() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-xl" aria-label="Notifikasi">
          <Bell className="h-[18px] w-[18px]" />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-destructive" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[330px] rounded-xl p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Notifikasi</p>
          <Pill tone="brand">{notifications.length} baru</Pill>
        </div>
        <div className="max-h-[340px] overflow-y-auto">
          {notifications.map((n) => (
            <div
              key={n.id}
              className="flex gap-3 border-b border-border/60 px-4 py-3 transition-colors last:border-0 hover:bg-accent/50"
            >
              <span
                className={cn(
                  "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                  n.tone === "warning" && "bg-warning",
                  n.tone === "success" && "bg-success",
                  n.tone === "info" && "bg-info",
                )}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{n.title}</p>
                <p className="text-xs text-muted-foreground">{n.body}</p>
                <p className="mt-1 text-[11px] text-muted-foreground/80">{n.time}</p>
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { status, user, hasModule, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);

  const onLogout = async () => {
    try {
      await logout();
    } finally {
      toast.success("Anda telah keluar.");
      navigate({ to: "/login" });
    }
  };

  // Route guard: unauthenticated users go to /login; authenticated users skip it.
  useEffect(() => {
    if (status === "unauthenticated" && pathname !== "/login") {
      navigate({ to: "/login" });
    } else if (status === "authenticated" && pathname === "/login") {
      navigate({ to: "/" });
    }
  }, [status, pathname, navigate]);

  const visibleGroups = useMemo(
    () =>
      navGroups
        .map((g) => {
          const isPublic = g.label === "Dashboard" || g.label === "Barcode";
          if (!g.children || isPublic) return g;
          const groupModule = g.module ?? g.label;
          const children = g.children.filter((c) => hasModule(c.module ?? groupModule));
          return { ...g, children };
        })
        .filter((g) => {
          if (g.label === "Dashboard" || g.label === "Barcode") return true;
          const groupModule = g.module ?? g.label;
          if (!hasModule(groupModule)) return false;
          // A group only renders when it has at least one visible child (or is a plain link).
          return !g.children || g.children.length > 0;
        }),
    [hasModule],
  );

  const visibleQuickActions = useMemo(
    () => quickActions.filter((a) => !a.module || hasModule(a.module)),
    [hasModule],
  );

  const visibleBottomNav = useMemo(
    () => bottomNav.filter((b) => !b.module || hasModule(b.module)),
    [hasModule],
  );

  // Route guard: block direct navigation to a module the role cannot access.
  const routeModule = moduleForPath(pathname);
  const routeForbidden =
    status === "authenticated" && routeModule !== null && !hasModule(routeModule);

  // Show the bare login page (no sidebar) as long as /login is the committed
  // route match. Gate on `useMatches`, not `pathname`: during a navigation the
  // router updates `location` before it commits the new `matches`, so a
  // pathname check would paint the dashboard sidebar while the login page is
  // still the active match (the lingering overlap after login).
  const matches = useMatches();
  const isLogin = matches[matches.length - 1]?.routeId === "/login";

  if (isLogin) return <>{children}</>;

  // Auth not resolved (SSR/hydration) or the user is being bounced to /login:
  // never paint the dashboard before the session is confirmed, so a browser
  // without a login marker lands on the login page instead.
  if (status !== "authenticated") {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const displayName = user?.name ?? "";
  const initials =
    displayName
      .split(" ")
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U";

  return (
    <div className="min-h-screen bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-300 lg:block",
          collapsed ? "w-[76px]" : "w-[260px]",
        )}
      >
        <div
          className={cn(
            "flex h-16 items-center border-b border-sidebar-border px-4",
            collapsed && "justify-center px-0",
          )}
        >
          <Logo compact={collapsed} />
        </div>
        <div className="h-[calc(100vh-4rem)]">
          <SidebarNav collapsed={collapsed} visibleGroups={visibleGroups} />
        </div>
      </aside>

      <Sheet open={mobileNav} onOpenChange={setMobileNav}>
        <SheetContent side="left" className="w-[280px] bg-sidebar p-0">
          <SheetTitle className="sr-only">Menu Navigasi</SheetTitle>
          <div className="flex h-16 items-center border-b border-sidebar-border px-4">
            <Logo />
          </div>
          <div className="h-[calc(100vh-4rem)]">
            <SidebarNav
              collapsed={false}
              onNavigate={() => setMobileNav(false)}
              visibleGroups={visibleGroups}
            />
          </div>
        </SheetContent>
      </Sheet>

      <div
        className={cn(
          "transition-[padding] duration-300",
          collapsed ? "lg:pl-[76px]" : "lg:pl-[260px]",
        )}
      >
        <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
          <div className="grid h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 sm:px-5">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="rounded-xl lg:hidden"
                onClick={() => setMobileNav(true)}
                aria-label="Buka menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="hidden rounded-xl lg:inline-flex"
                onClick={() => setCollapsed((c) => !c)}
                aria-label="Ciutkan sidebar"
              >
                {collapsed ? (
                  <PanelLeftOpen className="h-[18px] w-[18px]" />
                ) : (
                  <PanelLeftClose className="h-[18px] w-[18px]" />
                )}
              </Button>
              <div className="lg:hidden">
                <Logo compact />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex h-10 min-w-0 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm text-muted-foreground shadow-soft transition-colors hover:bg-accent/40 md:max-w-lg"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="truncate">Cari barang, SKU, barcode, transaksi...</span>
              <kbd className="ml-auto hidden rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] md:inline">
                ⌘K
              </kbd>
            </button>

            <div className="flex items-center gap-0.5 sm:gap-1">
              <ThemePicker />
              <NotificationCenter />
              <ProfileHelpDialog
                user={user ?? undefined}
                onLogout={onLogout}
                trigger={
                  <button
                    type="button"
                    aria-label="Profil & bantuan"
                    className="ml-1 flex items-center gap-2 rounded-xl border border-border bg-card py-1 pl-1 pr-1 text-left transition-colors hover:bg-accent/50 sm:pr-3"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary-soft text-xs font-bold text-primary">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="hidden leading-tight sm:block">
                      <p className="text-xs font-semibold">{displayName}</p>
                      <p className="text-[11px] text-muted-foreground">{user?.role ?? ""}</p>
                    </div>
                  </button>
                }
              />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1600px] space-y-5 px-3 pb-28 pt-5 sm:px-5 lg:pb-10">
          {routeForbidden ? <RouteForbidden /> : children}
        </main>
      </div>

      {/* Mobile bottom navigation + FAB */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-xl lg:hidden">
        <div className="grid grid-cols-5 items-center">
          {visibleBottomNav.slice(0, 2).map((n) => (
            <BottomLink key={n.to} {...n} active={pathname === n.to} />
          ))}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setFabOpen(true)}
              aria-label="Aksi cepat"
              className="-mt-7 grid h-14 w-14 place-items-center rounded-2xl text-primary-foreground shadow-lift transition-transform active:scale-95"
              style={{ backgroundImage: "var(--gradient-primary)" }}
            >
              <Plus className="h-6 w-6" />
            </button>
          </div>
          {visibleBottomNav.slice(2).map((n) => (
            <BottomLink key={n.to} {...n} active={pathname === n.to} />
          ))}
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>

      <Drawer open={fabOpen} onOpenChange={setFabOpen}>
        <DrawerContent className="rounded-t-2xl">
          <DrawerHeader>
            <DrawerTitle>Aksi Cepat</DrawerTitle>
          </DrawerHeader>
          <div className="grid grid-cols-3 gap-3 px-4 pb-8">
            {visibleQuickActions.map((a) => (
              <Link
                key={a.label}
                to={a.to}
                onClick={() => setFabOpen(false)}
                className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-3 text-center text-xs font-medium transition-colors hover:bg-accent/50"
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
                  <a.icon className="h-5 w-5" />
                </span>
                {a.label}
              </Link>
            ))}
          </div>
        </DrawerContent>
      </Drawer>

      <GlobalSearch
        open={searchOpen}
        setOpen={setSearchOpen}
        visibleQuickActions={visibleQuickActions}
        canAccess={hasModule}
      />
    </div>
  );
}

function RouteForbidden() {
  return (
    <div className="grid min-h-[60vh] place-items-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">403</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Akses ditolak</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Role Anda tidak memiliki akses ke modul ini. Hubungi administrator bila Anda merasa
          seharusnya dapat mengakses halaman tersebut.
        </p>
      </div>
    </div>
  );
}

function BottomLink({
  to,
  label,
  icon: Icon,
  active,
}: {
  to: QuickAction["to"];
  label: QuickAction["label"];
  icon: QuickAction["icon"];
  active: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      <Icon className="h-5 w-5" />
      {label}
    </Link>
  );
}
