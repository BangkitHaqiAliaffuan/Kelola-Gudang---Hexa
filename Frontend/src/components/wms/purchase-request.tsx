import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  BadgeCheck,
  ClipboardList,
  Maximize2,
  Minimize2,
  Plus,
  Search,
  ShoppingCart,
  UserCheck,
} from "lucide-react";
import { ALL, ClearFiltersButton, FilterSelect, PageHeader, Panel, Pill, StatCard, type Tone } from "./kit";
import { DataTable, type Column } from "./data-table";
import { PurchaseRequestSheet } from "./purchase-request-sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useAuth } from "@/hooks/use-auth";
import { useDepartments, useSuppliers, useWarehouses } from "@/hooks/use-master";
import { useStockMinimum } from "@/hooks/use-persediaan";
import { useProcDoc, useProcDocs } from "@/hooks/use-pengadaan";
import { formatDate, formatIDR, formatIDRCompact, formatNumber } from "@/lib/wms-data";
import { cn } from "@/lib/utils";
import {
  canDecideProcDoc,
  procDocStatuses,
  type ProcDocApi,
  type ProcDocStatus,
} from "@/lib/pengadaan-types";
import type { StockMinimumApi } from "@/lib/persediaan-types";

const statusTone = (s: ProcDocStatus): Tone =>
  s === "Disetujui"
    ? "success"
    : s === "Ditolak"
      ? "danger"
      : s === "Menunggu Approval"
        ? "warning"
        : s === "Dibatalkan"
          ? "danger"
          : "neutral";

const fmtDate = (iso: string | null | undefined) => (iso ? formatDate(iso) : "—");

const needsRestock = (r: StockMinimumApi) => r.status !== "Normal" && r.suggested_qty > 0;

function RestockDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const navigate = useNavigate();
  const { data, isLoading } = useStockMinimum();
  const [selected, setSelected] = useState<Record<number, number>>({});

  const suggestions = useMemo(() => (data?.data ?? []).filter(needsRestock), [data]);

  const selectedCount = Object.keys(selected).length;

  const toggle = (r: StockMinimumApi, checked: boolean) =>
    setSelected((prev) => {
      const next = { ...prev };
      if (checked) next[r.item_id] = r.suggested_qty;
      else delete next[r.item_id];
      return next;
    });

  const createDraft = () => {
    const ids = Object.entries(selected);
    if (!ids.length) return;
    const qs = ids.map(([itemId, qty]) => `${itemId}:${qty}`).join(",");
    onOpenChange(false);
    setSelected({});
    navigate({ to: "/pengadaan/purchase-request/new", search: { restock: qs } });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="max-w-2xl rounded-xl">
        <DialogHeader>
          <DialogTitle>Saran Restock</DialogTitle>
          <DialogDescription>
            Barang dengan stok di bawah minimum (status Habis / Kritis / Menipis). Centang item
            untuk menyusun draft Purchase Request secara otomatis.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Memuat saran restock...</p>
        ) : suggestions.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Semua barang berada di atas stok minimum. Tidak ada saran restock.
          </p>
        ) : (
          <div className="max-h-[50vh] overflow-auto rounded-xl border border-border">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="sticky top-0 bg-muted/70 backdrop-blur">
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="w-10 px-3 py-2" />
                  {["Barang", "Stok", "Min", "Saran", "Status"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {suggestions.map((r) => {
                  const checked = selected[r.item_id] != null;
                  return (
                    <tr key={r.item_id} className="border-b border-border/60">
                      <td className="px-3 py-2">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(c) => toggle(r, c === true)}
                          aria-label={`Pilih ${r.name}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-medium">{r.name}</p>
                        <p className="text-xs text-muted-foreground">{r.sku ?? "—"}</p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                        {formatNumber(r.total_stock)} {r.unit ?? ""}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                        {formatNumber(r.min)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-medium">
                        {formatNumber(r.suggested_qty)} {r.unit ?? ""}
                      </td>
                      <td className="px-3 py-2">
                        <Pill
                          tone={
                            r.status === "Habis"
                              ? "danger"
                              : r.status === "Kritis"
                                ? "warning"
                                : "info"
                          }
                        >
                          {r.status}
                        </Pill>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Tutup
          </Button>
          <Button
            className="rounded-xl"
            disabled={selectedCount === 0 || isLoading}
            onClick={createDraft}
          >
            <Plus className="h-4 w-4" /> Buat Draft PR ({selectedCount})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PurchaseRequestPage() {
  const { hasModule, hasModuleLevel, user } = useAuth();
  const canCreate = hasModuleLevel("Pengadaan", "Tulis");
  const canManage = hasModuleLevel("Pengadaan", "Kelola");
  const canApprove = hasModule("Approval Pengadaan");
  const canApproveAny = canApprove || canManage;
  const canViewRestock = hasModuleLevel("Persediaan", "Baca");
  const canDecide = useCallback(
    (d: ProcDocApi) => canDecideProcDoc(d, user, canApprove, canManage),
    [user, canApprove, canManage],
  );
  const { data, isLoading } = useProcDocs();
  const { data: departments, isLoading: departmentsLoading } = useDepartments();
  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [status, setStatus] = useState(ALL);
  const [dept, setDept] = useState(ALL);
  const [wh, setWh] = useState(ALL);
  const [myApproval, setMyApproval] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [restockOpen, setRestockOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const { data: detail, isLoading: detailLoading } = useProcDoc(selectedId ?? undefined);
  const hasActiveFilters = useMemo(
    () => q !== "" || status !== ALL || dept !== ALL || wh !== ALL || myApproval,
    [q, status, dept, wh, myApproval],
  );
  const handleClearFilters = useCallback(() => {
    setQ("");
    setStatus(ALL);
    setDept(ALL);
    setWh(ALL);
    setMyApproval(false);
  }, []);

  const qn = debouncedQ.trim().toLowerCase().replace(/\s+/g, " ");

  const rows = useMemo(
    () =>
      (data?.data ?? []).filter((d) => {
        const hay =
          `${d.no} ${d.requester ?? ""} ${d.department ?? ""} ${d.supplier ?? ""} ${d.warehouse ?? ""} ${d.reference ?? ""} ${d.status}`.toLowerCase();
        return (
          (!qn || hay.includes(qn)) &&
          (status === ALL || d.status === status) &&
          (dept === ALL || d.department === dept) &&
          (wh === ALL || d.warehouse === wh) &&
          (!myApproval || canDecide(d))
        );
      }),
    [data, qn, status, dept, wh, myApproval, canDecide],
  );

  const stats = useMemo(() => {
    const all = data?.data ?? [];
    const pending = all.filter((d) => d.status === "Menunggu Approval").length;
    const approved = all.filter((d) => d.status === "Disetujui").length;
    const approvable = all.filter((d) => canDecide(d)).length;
    const value = all.reduce((sum, d) => sum + (d.value_total ?? 0), 0);
    return { total: all.length, pending, approved, approvable, value };
  }, [data, canDecide]);

  const columns: Column<ProcDocApi>[] = [
    {
      key: "no",
      label: "Nomor",
      className: "w-[160px] whitespace-nowrap",
      sortable: true,
      render: (r) => <span className="font-mono text-xs font-semibold text-primary">{r.no}</span>,
    },
    {
      key: "document_date",
      label: "Tanggal",
      className: "w-[120px] whitespace-nowrap",
      sortable: true,
      render: (r) => fmtDate(r.document_date),
    },
    {
      key: "department",
      label: "Departemen",
      className: "min-w-[140px] whitespace-nowrap",
      sortable: true,
      render: (r) => r.department ?? "—",
    },
    {
      key: "supplier",
      label: "Supplier",
      className: "min-w-[160px] whitespace-nowrap",
      sortable: true,
      render: (r) => r.supplier ?? "—",
    },
    {
      key: "warehouse",
      label: "Gudang",
      className: "min-w-[140px] whitespace-nowrap",
      sortable: true,
      render: (r) => r.warehouse ?? "—",
    },
    {
      key: "qty_total",
      label: "Qty",
      className: "text-right w-[90px] whitespace-nowrap",
      sortable: true,
      render: (r) => formatNumber(r.qty_total ?? 0),
    },
    {
      key: "value_total",
      label: "Nilai",
      className: "text-right w-[130px] whitespace-nowrap",
      sortable: true,
      render: (r) => formatIDR(r.value_total ?? 0),
    },
    {
      key: "status",
      label: "Status",
      className: "w-[180px] whitespace-nowrap",
      sortable: true,
      render: (r) => (
        <div className="flex flex-col items-start gap-1">
          <Pill tone={statusTone(r.status)}>{r.status}</Pill>
          {canDecide(r) && <Pill tone="warning">Perlu Persetujuan</Pill>}
        </div>
      ),
    },
  ];

  return (
    <>
      <div inert={fullscreen || undefined} className="space-y-5">
        <PageHeader
          title="Purchase Request"
          description="Permintaan pembelian barang dari departemen"
          actions={
            <>
              {canViewRestock && (
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setRestockOpen(true)}
                >
                  <AlertTriangle className="h-4 w-4" /> Saran Restock
                </Button>
              )}
              {canCreate && (
                <Button asChild className="rounded-xl">
                  <Link to="/pengadaan/purchase-request/new">
                    <Plus className="h-4 w-4" /> Buat Purchase Request
                  </Link>
                </Button>
              )}
            </>
          }
        />

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="Total PR"
            value={formatNumber(stats.total)}
            hint="Dokumen permintaan"
            icon={ClipboardList}
            tone="brand"
            loading={isLoading}
          />
          <StatCard
            label="Menunggu Approval"
            value={formatNumber(stats.pending)}
            hint="Perlu ditindaklanjuti"
            icon={ShoppingCart}
            tone="warning"
            loading={isLoading}
          />
          {canApproveAny && (
            <StatCard
              label="Perlu Persetujuan Saya"
              value={formatNumber(stats.approvable)}
              hint="Dapat Anda setujui/tolak"
              icon={UserCheck}
              tone="brand"
              loading={isLoading}
            />
          )}
          <StatCard
            label="Disetujui"
            value={formatNumber(stats.approved)}
            hint="Siap diterbitkan PO"
            icon={BadgeCheck}
            tone="success"
            loading={isLoading}
          />
          <StatCard
            label="Nilai Total"
            value={formatIDRCompact(stats.value)}
            valueTitle={formatIDR(stats.value)}
            hint="Estimasi seluruh PR"
            icon={ShoppingCart}
            tone="info"
            loading={isLoading}
          />
        </div>

        <Panel title="Filter">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cari nomor, departemen, supplier, gudang, referensi, status..."
                className="rounded-xl pl-9"
              />
            </div>
            <FilterSelect
              className="w-full"
              value={status}
              onChange={setStatus}
              placeholder="Semua Status"
              options={[...procDocStatuses]}
            />
            <FilterSelect
              className="w-full"
              value={dept}
              onChange={setDept}
              placeholder="Semua Departemen"
              options={departments?.data.map((d) => d.name) ?? []}
              loading={departmentsLoading}
            />
            <FilterSelect
              className="w-full"
              value={wh}
              onChange={setWh}
              placeholder="Semua Gudang"
              options={warehouses?.data.map((w) => w.name) ?? []}
              loading={warehousesLoading}
            />
            <div className="flex items-end justify-start xl:justify-end">
              <ClearFiltersButton visible={hasActiveFilters} onClick={handleClearFilters} />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            {canApproveAny && (
              <Button
                variant={myApproval ? "default" : "outline"}
                className="rounded-xl"
                aria-pressed={myApproval}
                onClick={() => setMyApproval((v) => !v)}
              >
                <UserCheck className="h-4 w-4" />
                Perlu Persetujuan Saya
                {stats.approvable > 0 && ` (${formatNumber(stats.approvable)})`}
              </Button>
            )}
          </div>
        </Panel>
      </div>

      <Panel
        title="Daftar Purchase Request"
        description={`${formatNumber(rows.length)} dokumen`}
        actions={
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl"
            aria-pressed={fullscreen}
            aria-label={fullscreen ? "Keluar mode layar penuh" : "Tampilkan layar penuh"}
            onClick={() => setFullscreen((f) => !f)}
          >
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            {fullscreen ? "Keluar" : "Fullscreen"}
          </Button>
        }
        className={cn(fullscreen && "fixed inset-0 z-40 flex flex-col !rounded-none !shadow-none")}
        bodyClassName={cn(fullscreen && "flex-1 overflow-auto")}
      >
        <DataTable
          columns={columns}
          rows={rows}
          pageSize={12}
          loading={isLoading}
          onRowClick={(r) => setSelectedId(r.id)}
          mobileCard={(r) => (
            <div className="space-y-1.5">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <p className="truncate font-mono text-sm font-semibold">{r.no}</p>
                <Pill tone={statusTone(r.status)}>{r.status}</Pill>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {fmtDate(r.document_date)} · {r.department ?? "—"} · {r.supplier ?? "—"}
              </p>
              {canDecide(r) && (
                <Pill tone="warning" className="text-[10px]">
                  Perlu Persetujuan Anda
                </Pill>
              )}
              <div className="flex justify-between pt-1 text-xs">
                <span>{formatNumber(r.qty_total ?? 0)} unit</span>
                <b>{formatIDR(r.value_total ?? 0)}</b>
              </div>
            </div>
          )}
        />
      </Panel>

      <PurchaseRequestSheet
        doc={detail?.data ?? null}
        isLoading={detailLoading}
        onOpenChange={(o) => !o && setSelectedId(null)}
      />

      <RestockDialog open={restockOpen} onOpenChange={setRestockOpen} />
    </>
  );
}
