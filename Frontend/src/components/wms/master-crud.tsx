import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  useForm,
  type DefaultValues,
  type FieldValues,
  type Resolver,
  type UseFormReturn,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Loader2, MoreVertical, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { DataTable, type Column } from "./data-table";
import { PageHeader, Panel } from "./kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function MasterCrudPage<T extends { id: number }>({
  title,
  description,
  searchPlaceholder,
  searchText,
  columns,
  mobileCard,
  rows,
  isLoading,
  onAdd,
  addLabel = "Tambah",
  onRowClick,
  onEdit,
  onDelete,
}: {
  title: string;
  description: string;
  searchPlaceholder: string;
  searchText: (row: T) => string;
  columns: Column<T>[];
  mobileCard: (row: T) => ReactNode;
  rows: T[] | undefined;
  isLoading: boolean;
  onAdd: () => void;
  addLabel?: string;
  onRowClick?: (row: T) => void;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void | Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<T | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    if (!rows) return undefined;
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => searchText(r).toLowerCase().includes(needle));
  }, [rows, q, searchText]);

  const actionColumn: Column<T> | undefined =
    onEdit || onDelete
      ? {
          key: "actions",
          label: "",
          className: "w-10",
          sticky: "right",
          render: (r) => (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 rounded-lg"
                    aria-label="Aksi"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  {onEdit && (
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(r);
                      }}
                    >
                      <Pencil className="h-4 w-4" /> Edit
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <>
                      {onEdit && <DropdownMenuSeparator />}
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(r);
                        }}
                      >
                        <Trash2 className="h-4 w-4" /> Hapus
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ),
        }
      : undefined;

  const allColumns = actionColumn ? [...columns, actionColumn] : columns;

  const mobileCardWithActions = (row: T): ReactNode => (
    <>
      {mobileCard(row)}
      {(onEdit || onDelete) && (
        <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
          {onEdit && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-lg"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(row);
              }}
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
          )}
          {onDelete && (
            <Button
              size="sm"
              variant="ghost"
              className="rounded-lg text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                setDeleteTarget(row);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Hapus
            </Button>
          )}
        </div>
      )}
    </>
  );

  const handleConfirmDelete = async () => {
    if (!deleteTarget || !onDelete) return;
    setDeleting(true);
    try {
      await onDelete(deleteTarget);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          <Button className="rounded-xl" onClick={onAdd}>
            <Plus className="h-4 w-4" /> {addLabel}
          </Button>
        }
      />
      <Panel title={title} {...(filtered ? { description: `${filtered.length} data` } : {})}>
        <div className="relative mb-4 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={searchPlaceholder}
            className="rounded-xl pl-9"
          />
        </div>
        <DataTable
          columns={allColumns}
          rows={filtered ?? []}
          pageSize={10}
          loading={isLoading}
          {...(onRowClick ? { onRowClick } : {})}
          mobileCard={mobileCardWithActions}
        />
      </Panel>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus data?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini tidak dapat dibatalkan. Data akan dihapus permanen dari database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Batal</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmDelete();
              }}
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />} Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function CrudFormDialog<TValues extends FieldValues>({
  open,
  onOpenChange,
  title,
  description,
  schema,
  defaultValues,
  resetKey,
  renderFields,
  onSubmit,
  submitLabel = "Simpan",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  schema: z.ZodType<unknown, z.ZodTypeDef, Record<string, unknown>>;
  defaultValues: DefaultValues<TValues>;
  resetKey: string;
  renderFields: (form: UseFormReturn<TValues>) => ReactNode;
  onSubmit: (values: TValues, form: UseFormReturn<TValues>) => Promise<void> | void;
  submitLabel?: string;
}) {
  const form = useForm<TValues, unknown, TValues>({
    resolver: zodResolver(schema) as Resolver<TValues>,
    defaultValues,
  });
  const { isSubmitting } = form.formState;

  useEffect(() => {
    if (open) form.reset(defaultValues);
    // resetKey forces a reset when switching between create/edit targets.
  }, [open, resetKey, defaultValues, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form
          noValidate
          onSubmit={form.handleSubmit(async (values) => {
            try {
              await onSubmit(values, form);
            } catch {
              // errors surfaced via form.setError in onSubmit; keep dialog open
            }
          })}
          className="space-y-4"
        >
          {renderFields(form)}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Batal
            </Button>
            <Button type="submit" className="rounded-xl" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />} {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
