import { Pencil } from "lucide-react";
import type { ReactNode } from "react";
import { Pill } from "./kit";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatDate, formatNumber } from "@/lib/wms-data";
import type { Customer, Supplier, Vendor } from "@/lib/master-types";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border px-3 py-2">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="break-words text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold">{title}</p>
      <div className="grid gap-2.5 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return active ? <Pill tone="success">Aktif</Pill> : <Pill tone="neutral">Nonaktif</Pill>;
}

export function SupplierDetailSheet({
  entity,
  onOpenChange,
  onEdit,
}: {
  entity: Supplier | null;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
}) {
  const { hasModuleLevel } = useAuth();
  const canEdit = hasModuleLevel("Master Data", "Tulis");
  return (
    <Sheet open={entity !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl lg:max-w-2xl"
      >
        {entity && (
          <>
            <SheetHeader className="border-b border-border px-5 py-4 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="font-mono text-base">{entity.code}</SheetTitle>
                <StatusPill active={entity.is_active} />
              </div>
              <SheetDescription>{entity.name}</SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <Section title="Identitas">
                <Field label="Nama" value={entity.name} />
                <Field label="Nama Legal" value={entity.legal_name ?? "—"} />
                <Field label="Kode" value={entity.code} />
                <Field label="NIB" value={entity.nib ?? "—"} />
                <Field label="NPWP" value={entity.npwp ?? "—"} />
              </Section>

              <Section title="Kontak & Alamat">
                <Field label="Telepon" value={entity.phone ?? "—"} />
                <Field label="Email" value={entity.email ?? "—"} />
                <Field label="PIC" value={entity.pic_name ?? "—"} />
                <Field label="Website" value={entity.website ?? "—"} />
                <Field label="Alamat" value={entity.address ?? "—"} />
                <Field label="Kota" value={entity.city ?? "—"} />
                <Field label="Termin Pembayaran" value={entity.payment_terms ?? "—"} />
              </Section>

              <Section title="Bank">
                <Field label="Bank" value={entity.bank_name ?? "—"} />
                <Field label="No. Rekening" value={entity.bank_account_no ?? "—"} />
                <Field label="Atas Nama" value={entity.bank_account_name ?? "—"} />
              </Section>

              <Section title="Lainnya">
                <Field label="Jumlah Barang" value={formatNumber(entity.items_count ?? 0)} />
                <Field label="Dibuat" value={formatDate(entity.created_at)} />
                <Field label="Diperbarui" value={formatDate(entity.updated_at)} />
              </Section>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-card px-5 py-3">
              <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
                Tutup
              </Button>
              {canEdit && (
                <Button className="rounded-xl" onClick={onEdit}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function CustomerDetailSheet({
  entity,
  onOpenChange,
  onEdit,
}: {
  entity: Customer | null;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
}) {
  const { hasModuleLevel } = useAuth();
  const canEdit = hasModuleLevel("Master Data", "Tulis");
  return (
    <Sheet open={entity !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl lg:max-w-2xl"
      >
        {entity && (
          <>
            <SheetHeader className="border-b border-border px-5 py-4 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="font-mono text-base">{entity.code}</SheetTitle>
                <StatusPill active={entity.is_active} />
              </div>
              <SheetDescription>{entity.name}</SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <Section title="Identitas">
                <Field label="Nama" value={entity.name} />
                <Field label="Nama Legal" value={entity.legal_name ?? "—"} />
                <Field label="Kode" value={entity.code} />
                <Field label="NIB" value={entity.nib ?? "—"} />
                <Field label="NPWP" value={entity.npwp ?? "—"} />
              </Section>

              <Section title="Kontak & Alamat">
                <Field label="Telepon" value={entity.phone ?? "—"} />
                <Field label="Email" value={entity.email ?? "—"} />
                <Field label="PIC" value={entity.pic_name ?? "—"} />
                <Field label="Website" value={entity.website ?? "—"} />
                <Field label="Alamat" value={entity.address ?? "—"} />
                <Field label="Kota" value={entity.city ?? "—"} />
                <Field label="Segmen" value={entity.segment ?? "—"} />
              </Section>

              <Section title="Bank">
                <Field label="Bank" value={entity.bank_name ?? "—"} />
                <Field label="No. Rekening" value={entity.bank_account_no ?? "—"} />
                <Field label="Atas Nama" value={entity.bank_account_name ?? "—"} />
              </Section>

              <Section title="Lainnya">
                <Field label="Dibuat" value={formatDate(entity.created_at)} />
                <Field label="Diperbarui" value={formatDate(entity.updated_at)} />
              </Section>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-card px-5 py-3">
              <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
                Tutup
              </Button>
              {canEdit && (
                <Button className="rounded-xl" onClick={onEdit}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function VendorDetailSheet({
  entity,
  onOpenChange,
  onEdit,
}: {
  entity: Vendor | null;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
}) {
  const { hasModuleLevel } = useAuth();
  const canEdit = hasModuleLevel("Master Data", "Tulis");
  return (
    <Sheet open={entity !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl lg:max-w-2xl"
      >
        {entity && (
          <>
            <SheetHeader className="border-b border-border px-5 py-4 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="font-mono text-base">{entity.code}</SheetTitle>
                <StatusPill active={entity.is_active} />
              </div>
              <SheetDescription>{entity.name}</SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <Section title="Identitas">
                <Field label="Nama" value={entity.name} />
                <Field label="Nama Legal" value={entity.legal_name ?? "—"} />
                <Field label="Kode" value={entity.code} />
                <Field label="NIB" value={entity.nib ?? "—"} />
                <Field label="NPWP" value={entity.npwp ?? "—"} />
              </Section>

              <Section title="Kontak & Layanan">
                <Field label="Jenis Layanan" value={entity.service_type ?? "—"} />
                <Field label="Telepon Kontak" value={entity.contact_phone ?? "—"} />
                <Field label="Email" value={entity.email ?? "—"} />
                <Field label="PIC" value={entity.pic_name ?? "—"} />
                <Field label="Website" value={entity.website ?? "—"} />
              </Section>

              <Section title="Bank">
                <Field label="Bank" value={entity.bank_name ?? "—"} />
                <Field label="No. Rekening" value={entity.bank_account_no ?? "—"} />
                <Field label="Atas Nama" value={entity.bank_account_name ?? "—"} />
              </Section>

              <Section title="Lainnya">
                <Field label="Dibuat" value={formatDate(entity.created_at)} />
                <Field label="Diperbarui" value={formatDate(entity.updated_at)} />
              </Section>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-card px-5 py-3">
              <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
                Tutup
              </Button>
              {canEdit && (
                <Button className="rounded-xl" onClick={onEdit}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
