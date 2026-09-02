import { useCallback, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Sparkles,
  TriangleAlert,
  Upload,
  XCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { downloadCsv, toCsv } from "@/lib/csv";
import { formatNumber } from "@/lib/wms-data";
import {
  useBins,
  useCategories,
  useItems,
  useMerks,
  useRacks,
  useSubCategories,
  useSuppliers,
  useUnits,
  useWarehouses,
  useBulkImportItems,
  type BulkImportItem,
} from "@/hooks/use-master";

type RawRow = Record<string, string>;

type AutoCreateEntry = {
  name: string;
  checked: boolean;
};

type ParsedRow = {
  raw: RawRow;
  resolved: Partial<BulkImportItem>;
  status: "valid" | "duplicate" | "error" | "auto_create";
  errors: string[];
  warnings: string[];
  action: "create" | "update";
  autoCreateCat?: AutoCreateEntry | undefined;
  autoCreateMerk?: AutoCreateEntry | undefined;
  autoCreateUnit?: AutoCreateEntry | undefined;
};

const CSV_HEADERS = [
  { key: "sku", label: "SKU" },
  { key: "barcode", label: "Barcode" },
  { key: "name", label: "Nama Barang" },
  { key: "category", label: "Kategori" },
  { key: "sub_category", label: "Sub Kategori" },
  { key: "brand", label: "Merk" },
  { key: "supplier", label: "Supplier" },
  { key: "unit", label: "Satuan" },
  { key: "warehouse", label: "Gudang Default" },
  { key: "rack", label: "Rak Default" },
  { key: "bin", label: "Bin Default" },
  { key: "cost", label: "Harga Pokok" },
  { key: "price", label: "Harga Jual" },
  { key: "min_stock", label: "Stock Minimum" },
  { key: "max_stock", label: "Stock Maksimum" },
  { key: "lead_time", label: "Lead Hari" },
  { key: "weight", label: "Berat" },
  { key: "dimension", label: "Dimensi" },
  { key: "status", label: "Status" },
] as const;

const TEMPLATE_ROWS = [
  {
    sku: "SKU-CONTOH-001",
    barcode: "8991234567890",
    name: "Contoh Barang A",
    category: "Elektronik",
    sub_category: "Handphone",
    brand: "Samsung",
    supplier: "PT Maju Jaya",
    unit: "Pcs",
    warehouse: "Gudang Pusat",
    rack: "A-01",
    bin: "01-02",
    cost: "50000",
    price: "75000",
    min_stock: "10",
    max_stock: "100",
    lead_time: "7",
    weight: "0.5",
    dimension: "15x8x5 cm",
    status: "Aktif",
  },
  {
    sku: "SKU-CONTOH-002",
    barcode: "",
    name: "Contoh Barang B",
    category: "ATK",
    sub_category: "",
    brand: "Snowman",
    supplier: "",
    unit: "Box",
    warehouse: "Gudang Utama",
    rack: "",
    bin: "",
    cost: "200",
    price: "500",
    min_stock: "50",
    max_stock: "",
    lead_time: "3",
    weight: "",
    dimension: "",
    status: "Aktif",
  },
];

function findIdByName<T extends { id: number; name: string }>(
  list: T[],
  name: string | null | undefined,
): number | null {
  if (!name?.trim()) return null;
  const needle = name.trim().toLowerCase();
  const match = list.find((item) => item.name.trim().toLowerCase() === needle);
  return match?.id ?? null;
}

function findRackId(
  racks: { id: number; code: string; name: string }[],
  code: string | null | undefined,
): number | null {
  if (!code?.trim()) return null;
  const needle = code.trim().toUpperCase();
  const match = racks.find(
    (r) => r.code.toUpperCase() === needle || r.name.toUpperCase() === needle,
  );
  return match?.id ?? null;
}

function findBinId(
  bins: { id: number; code: string; name: string }[],
  code: string | null | undefined,
): number | null {
  if (!code?.trim()) return null;
  const needle = code.trim().toUpperCase();
  const match = bins.find(
    (b) => b.code.toUpperCase() === needle || b.name.toUpperCase() === needle,
  );
  return match?.id ?? null;
}

function parseNumber(val: string | undefined): number | null {
  if (!val?.trim()) return null;
  const n = Number(val.replace(/[.,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function ImportBarangDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: catsData } = useCategories();
  const { data: subCatsData } = useSubCategories();
  const { data: merksData } = useMerks();
  const { data: unitsData } = useUnits();
  const { data: warehousesData } = useWarehouses();
  const { data: racksData } = useRacks();
  const { data: binsData } = useBins();
  const { data: suppliersData } = useSuppliers();
  const { data: itemsData } = useItems();
  const bulkImport = useBulkImportItems();

  const categories = useMemo(() => catsData?.data ?? [], [catsData]);
  const subCategories = useMemo(() => subCatsData?.data ?? [], [subCatsData]);
  const merks = useMemo(() => merksData?.data ?? [], [merksData]);
  const units = useMemo(() => unitsData?.data ?? [], [unitsData]);
  const warehouses = useMemo(() => warehousesData?.data ?? [], [warehousesData]);
  const racks = useMemo(() => racksData?.data ?? [], [racksData]);
  const bins = useMemo(() => binsData?.data ?? [], [binsData]);
  const suppliers = useMemo(() => suppliersData?.data ?? [], [suppliersData]);
  const existingItems = useMemo(() => itemsData?.data ?? [], [itemsData]);
  const existingSkus = useMemo(
    () => new Set(existingItems.map((i) => i.sku.toUpperCase())),
    [existingItems],
  );

  const handleDownloadTemplate = useCallback(() => {
    const content = toCsv(TEMPLATE_ROWS, [...CSV_HEADERS]);
    downloadCsv("template-import-barang.csv", content);
    toast.success("Template diunduh");
  }, []);

  const processFile = useCallback(
    (file: File) => {
      Papa.parse<RawRow>(file, {
        header: true,
        skipEmptyLines: true,
        complete(results) {
          const rows = results.data;

          // Pre-pass: collect unique names for auto-create entities
          const uniqueCatNames = new Set<string>();
          const uniqueMerkNames = new Set<string>();
          const uniqueUnitNames = new Set<string>();

          for (const row of rows) {
            const catName = row["Kategori"]?.trim();
            if (catName && !findIdByName(categories, catName)) {
              uniqueCatNames.add(catName);
            }
            const merkName = row["Merk"]?.trim();
            if (merkName && !findIdByName(merks, merkName)) {
              uniqueMerkNames.add(merkName);
            }
            const unitName = row["Satuan"]?.trim();
            if (unitName && !findIdByName(units, unitName)) {
              uniqueUnitNames.add(unitName);
            }
          }

          function isAutoCreatable(names: Set<string>, name: string): boolean {
            return names.has(name);
          }

          const parsed: ParsedRow[] = rows.map((row) => {
            const errors: string[] = [];
            const warnings: string[] = [];
            const resolved: Partial<BulkImportItem> = {};
            const sku = row["SKU"]?.trim() ?? "";

            if (!sku) errors.push("SKU wajib diisi");

            const name = row["Nama Barang"]?.trim() ?? "";
            if (!name) errors.push("Nama Barang wajib diisi");

            // Resolve Kategori — auto-createable
            const catName = row["Kategori"]?.trim() ?? "";
            const catId = findIdByName(categories, catName);
            let autoCreateCat: AutoCreateEntry | undefined;
            if (catId) {
              resolved.category_id = catId;
            } else if (catName && isAutoCreatable(uniqueCatNames, catName)) {
              resolved.category_name = catName;
              autoCreateCat = { name: catName, checked: true };
            } else if (catName) {
              errors.push(`Kategori '${catName}' tidak ditemukan`);
            } else {
              errors.push("Kategori wajib diisi");
            }

            // Sub Kategori — optional, warning if not found
            const subCatId = findIdByName(subCategories, row["Sub Kategori"]);
            if (row["Sub Kategori"]?.trim() && subCatId) resolved.sub_category_id = subCatId;
            else if (row["Sub Kategori"]?.trim())
              warnings.push(`Sub Kategori '${row["Sub Kategori"]!.trim()}' tidak ditemukan, item akan dibuat tanpa sub kategori`);

            // Merk — auto-createable
            const merkName = row["Merk"]?.trim() ?? "";
            const merkId = findIdByName(merks, merkName);
            let autoCreateMerk: AutoCreateEntry | undefined;
            if (merkId) {
              resolved.brand_id = merkId;
            } else if (merkName && isAutoCreatable(uniqueMerkNames, merkName)) {
              resolved.brand_name = merkName;
              autoCreateMerk = { name: merkName, checked: true };
            }

            // Satuan — auto-createable
            const unitName = row["Satuan"]?.trim() ?? "";
            const unitId = findIdByName(units, unitName);
            let autoCreateUnit: AutoCreateEntry | undefined;
            if (unitId) {
              resolved.unit_id = unitId;
            } else if (unitName && isAutoCreatable(uniqueUnitNames, unitName)) {
              resolved.unit_name = unitName;
              autoCreateUnit = { name: unitName, checked: true };
            }

            // Supplier — wajib-existing
            const supplierId = findIdByName(suppliers, row["Supplier"]);
            if (row["Supplier"]?.trim() && supplierId) resolved.preferred_supplier_id = supplierId;
            else if (row["Supplier"]?.trim())
              errors.push(`Supplier '${row["Supplier"]!.trim()}' tidak ditemukan`);

            // Gudang — wajib-existing
            const warehouseId = findIdByName(warehouses, row["Gudang Default"]);
            if (row["Gudang Default"]?.trim() && warehouseId)
              resolved.default_warehouse_id = warehouseId;
            else if (row["Gudang Default"]?.trim())
              errors.push(`Gudang '${row["Gudang Default"]!.trim()}' tidak ditemukan`);

            // Rak — wajib-existing
            const rackId = findRackId(racks, row["Rak Default"]);
            if (row["Rak Default"]?.trim() && rackId) resolved.default_rack_id = rackId;
            else if (row["Rak Default"]?.trim())
              errors.push(`Rak '${row["Rak Default"]!.trim()}' tidak ditemukan`);

            // Bin — wajib-existing
            const binId = findBinId(bins, row["Bin Default"]);
            if (row["Bin Default"]?.trim() && binId) resolved.default_bin_id = binId;
            else if (row["Bin Default"]?.trim())
              errors.push(`Bin '${row["Bin Default"]!.trim()}' tidak ditemukan`);

            const cost = parseNumber(row["Harga Pokok"]);
            if (cost == null || cost < 100) errors.push("Harga Pokok minimal Rp 100");
            else resolved.cost = cost;

            const price = parseNumber(row["Harga Jual"]);
            if (price == null || price < 100) errors.push("Harga Jual minimal Rp 100");
            else resolved.price = price;

            resolved.min_stock = parseNumber(row["Stock Minimum"]) ?? 0;

            const maxStock = parseNumber(row["Stock Maksimum"]);
            if (maxStock != null) resolved.max_stock = maxStock;

            const leadTime = parseNumber(row["Lead Hari"]);
            if (leadTime != null) resolved.lead_time = leadTime;

            const weight = parseNumber(row["Berat"]);
            if (weight != null) resolved.weight = weight;

            const dimension = row["Dimensi"]?.trim() ?? null;
            if (dimension) resolved.dimension = dimension;

            const statusRaw = row["Status"]?.trim() ?? "Aktif";
            resolved.status = statusRaw === "Nonaktif" ? "Nonaktif" : "Aktif";

            resolved.sku = sku;
            resolved.barcode = row["Barcode"]?.trim() || null;
            resolved.name = name;

            const isDuplicate = existingSkus.has(sku.toUpperCase());
            const action: "create" | "update" = isDuplicate ? "update" : "create";
            if (isDuplicate) errors.push("Duplikat SKU — akan diupdate");

            // Determine row-level status
            const hasAutoCreate = autoCreateCat || autoCreateMerk || autoCreateUnit;
            const hasFatalError = errors.some(
              (e) =>
                !e.startsWith("Duplikat SKU") &&
                !e.startsWith("Kategori '") &&
                !e.startsWith("Merk '") &&
                !e.startsWith("Satuan '") &&
                !e.startsWith("Supplier '") &&
                !e.startsWith("Gudang '") &&
                !e.startsWith("Rak '") &&
                !e.startsWith("Bin '"),
            );

            let status: ParsedRow["status"];
            if (hasFatalError) {
              status = "error";
            } else if (isDuplicate) {
              status = "duplicate";
            } else if (hasAutoCreate) {
              status = "auto_create";
            } else {
              status = "valid";
            }

            return {
              raw: row,
              resolved: resolved as Partial<BulkImportItem>,
              status,
              errors,
              warnings,
              action,
              autoCreateCat,
              autoCreateMerk,
              autoCreateUnit,
            };
          });

          setParsedRows(parsed);
          setFileName(file.name);
        },
        error() {
          toast.error("Gagal membaca file CSV");
        },
      });
    },
    [categories, subCategories, merks, units, suppliers, warehouses, racks, bins, existingSkus],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      e.target.value = "";
    },
    [processFile],
  );

  const toggleAction = useCallback((index: number) => {
    setParsedRows((prev) =>
      prev
        ? prev.map((row, i) =>
            i === index
              ? {
                  ...row,
                  action: row.action === "create" ? "update" : "create",
                  status: row.action === "create" ? "duplicate" : "valid",
                  errors:
                    row.action === "create"
                      ? [...row.errors, "Duplikat SKU — akan diupdate"]
                      : row.errors.filter((e) => !e.startsWith("Duplikat SKU")),
                }
              : row,
          )
        : prev,
    );
  }, []);

  const toggleAutoCreate = useCallback(
    (index: number, field: "autoCreateCat" | "autoCreateMerk" | "autoCreateUnit") => {
      setParsedRows((prev) =>
        prev
          ? prev.map((row, i) => {
              if (i !== index) return row;
              const entry = row[field];
              if (!entry) return row;
              const updated = { ...entry, checked: !entry.checked };
              const updatedRow = { ...row, [field]: updated };

              // Recalculate status based on remaining auto-creates and errors
              const hasAutoCreate =
                (field === "autoCreateCat" ? updated.checked : row.autoCreateCat?.checked) ||
                (field === "autoCreateMerk" ? updated.checked : row.autoCreateMerk?.checked) ||
                (field === "autoCreateUnit" ? updated.checked : row.autoCreateUnit?.checked);

              const fatalErrors = row.errors.filter(
                (e) =>
                  !e.startsWith("Duplikat SKU") &&
                  !e.startsWith("Kategori '") &&
                  !e.startsWith("Merk '") &&
                  !e.startsWith("Satuan '") &&
                  !e.startsWith("Supplier '") &&
                  !e.startsWith("Gudang '") &&
                  !e.startsWith("Rak '") &&
                  !e.startsWith("Bin '"),
              );

              if (fatalErrors.length > 0) {
                updatedRow.status = "error";
              } else if (row.action === "update") {
                updatedRow.status = "duplicate";
              } else if (hasAutoCreate) {
                updatedRow.status = "auto_create";
              } else {
                updatedRow.status = "valid";
              }

              return updatedRow;
            })
          : prev,
      );
    },
    [],
  );

  const toggleAllAutoCreate = useCallback(
    (field: "autoCreateCat" | "autoCreateMerk" | "autoCreateUnit", checked: boolean) => {
      setParsedRows((prev) =>
        prev
          ? prev.map((row) => {
              const entry = row[field];
              if (!entry) return row;
              const updated = { ...entry, checked };
              const updatedRow = { ...row, [field]: updated };

              const hasAutoCreate =
                (field === "autoCreateCat" ? updated.checked : row.autoCreateCat?.checked) ||
                (field === "autoCreateMerk" ? updated.checked : row.autoCreateMerk?.checked) ||
                (field === "autoCreateUnit" ? updated.checked : row.autoCreateUnit?.checked);

              const fatalErrors = row.errors.filter(
                (e) =>
                  !e.startsWith("Duplikat SKU") &&
                  !e.startsWith("Kategori '") &&
                  !e.startsWith("Merk '") &&
                  !e.startsWith("Satuan '") &&
                  !e.startsWith("Supplier '") &&
                  !e.startsWith("Gudang '") &&
                  !e.startsWith("Rak '") &&
                  !e.startsWith("Bin '"),
              );

              if (fatalErrors.length > 0) {
                updatedRow.status = "error";
              } else if (row.action === "update") {
                updatedRow.status = "duplicate";
              } else if (hasAutoCreate) {
                updatedRow.status = "auto_create";
              } else {
                updatedRow.status = "valid";
              }

              return updatedRow;
            })
          : prev,
      );
    },
    [],
  );

  const handleSubmit = useCallback(async () => {
    if (!parsedRows) return;

    // Build items — rows with unchecked auto-create become errors
    const toImport: BulkImportItem[] = [];
    for (const row of parsedRows) {
      if (row.status === "error") continue;

      // Check if any auto-create entry is unchecked → skip this row
      const hasUncheckedAutoCreate =
        (row.autoCreateCat && !row.autoCreateCat.checked) ||
        (row.autoCreateMerk && !row.autoCreateMerk.checked) ||
        (row.autoCreateUnit && !row.autoCreateUnit.checked);

      if (hasUncheckedAutoCreate) continue;

      toImport.push({ ...row.resolved, action: row.action } as BulkImportItem);
    }

    if (toImport.length === 0) {
      toast.error("Tidak ada baris valid untuk diimport");
      return;
    }

    setSubmitting(true);
    try {
      const res = await bulkImport.mutateAsync({ items: toImport });
      toast.success(res.message);
      if (res.errors && Object.keys(res.errors).length > 0) {
        toast.warning(`${Object.keys(res.errors).length} baris gagal diproses`);
      }
      setParsedRows(null);
      setFileName(null);
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }, [parsedRows, bulkImport, onOpenChange]);

  const stats = useMemo(() => {
    if (!parsedRows) return { valid: 0, duplicate: 0, autoCreate: 0, error: 0, total: 0 };
    return {
      valid: parsedRows.filter((r) => r.status === "valid").length,
      duplicate: parsedRows.filter((r) => r.status === "duplicate").length,
      autoCreate: parsedRows.filter((r) => r.status === "auto_create").length,
      error: parsedRows.filter((r) => r.status === "error").length,
      total: parsedRows.length,
    };
  }, [parsedRows]);

  const canSubmit =
    parsedRows && (stats.valid + stats.duplicate + stats.autoCreate) > 0 && !submitting;

  // Collect unique auto-create names for global toggle display
  const autoCreateSummary = useMemo(() => {
    if (!parsedRows) return { cats: [], merks: [], units: [] };
    const cats = [
      ...new Map(
        parsedRows
          .filter((r) => r.autoCreateCat)
          .map((r) => [r.autoCreateCat!.name, r.autoCreateCat!.checked]),
      ).entries(),
    ];
    const merks = [
      ...new Map(
        parsedRows
          .filter((r) => r.autoCreateMerk)
          .map((r) => [r.autoCreateMerk!.name, r.autoCreateMerk!.checked]),
      ).entries(),
    ];
    const units = [
      ...new Map(
        parsedRows
          .filter((r) => r.autoCreateUnit)
          .map((r) => [r.autoCreateUnit!.name, r.autoCreateUnit!.checked]),
      ).entries(),
    ];
    return { cats, merks, units };
  }, [parsedRows]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Barang</DialogTitle>
          <DialogDescription>
            Upload file CSV untuk import barang secara massal. Download template terlebih dahulu
            untuk memastikan format benar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-xl" onClick={handleDownloadTemplate}>
              <Download className="h-4 w-4" /> Download Template
            </Button>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-4 w-4" /> Pilih File CSV
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileChange}
            />
            {fileName && (
              <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                {fileName}
                <button
                  onClick={() => {
                    setParsedRows(null);
                    setFileName(null);
                  }}
                  className="ml-1 text-muted-foreground hover:text-foreground"
                >
                  <XCircle className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {parsedRows && (
            <>
              {/* Stats */}
              <div className="flex flex-wrap gap-3 text-xs">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" /> {stats.valid} Valid
                </span>
                {stats.autoCreate > 0 && (
                  <span className="flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5 text-info" /> {stats.autoCreate} Akan dibuat
                    baru
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 text-warning" /> {stats.duplicate}{" "}
                  Duplikat
                </span>
                <span className="flex items-center gap-1">
                  <XCircle className="h-3.5 w-3.5 text-destructive" /> {stats.error} Error
                </span>
                <span className="text-muted-foreground">/ {stats.total} total</span>
              </div>

              {/* Auto-create summary with global toggles */}
              {(autoCreateSummary.cats.length > 0 ||
                autoCreateSummary.merks.length > 0 ||
                autoCreateSummary.units.length > 0) && (
                <div className="rounded-xl border border-info/30 bg-info/5 p-3 text-xs space-y-2">
                  <p className="font-semibold text-info flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5" /> Entity baru yang akan dibuat otomatis:
                  </p>
                  {autoCreateSummary.cats.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground">Kategori:</span>
                      {autoCreateSummary.cats.map(([name, checked]) => (
                        <label
                          key={name}
                          className="flex items-center gap-1 cursor-pointer select-none"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => {
                              // Find first row with this cat name and toggle
                              const idx = parsedRows.findIndex(
                                (r) => r.autoCreateCat?.name === name,
                              );
                              if (idx >= 0) toggleAutoCreate(idx, "autoCreateCat");
                            }}
                          />
                          {name}
                        </label>
                      ))}
                    </div>
                  )}
                  {autoCreateSummary.merks.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground">Merk:</span>
                      {autoCreateSummary.merks.map(([name, checked]) => (
                        <label
                          key={name}
                          className="flex items-center gap-1 cursor-pointer select-none"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => {
                              const idx = parsedRows.findIndex(
                                (r) => r.autoCreateMerk?.name === name,
                              );
                              if (idx >= 0) toggleAutoCreate(idx, "autoCreateMerk");
                            }}
                          />
                          {name}
                        </label>
                      ))}
                    </div>
                  )}
                  {autoCreateSummary.units.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground">Satuan:</span>
                      {autoCreateSummary.units.map(([name, checked]) => (
                        <label
                          key={name}
                          className="flex items-center gap-1 cursor-pointer select-none"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => {
                              const idx = parsedRows.findIndex(
                                (r) => r.autoCreateUnit?.name === name,
                              );
                              if (idx >= 0) toggleAutoCreate(idx, "autoCreateUnit");
                            }}
                          />
                          {name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Preview table */}
              <div className="max-h-[40vh] overflow-auto rounded-xl border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-2 py-2 text-left font-semibold">#</th>
                      <th className="px-2 py-2 text-left font-semibold">SKU</th>
                      <th className="px-2 py-2 text-left font-semibold">Nama</th>
                      <th className="px-2 py-2 text-left font-semibold">Kategori</th>
                      <th className="px-2 py-2 text-left font-semibold">Status</th>
                      <th className="px-2 py-2 text-left font-semibold">Aksi</th>
                      <th className="px-2 py-2 text-left font-semibold">Catatan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((row, i) => (
                      <tr
                        key={i}
                        className={
                          row.status === "error"
                            ? "bg-destructive/5"
                            : row.status === "duplicate"
                              ? "bg-warning/5"
                              : row.status === "auto_create"
                                ? "bg-info/5"
                                : row.warnings.length > 0
                                  ? "bg-warning/5"
                                  : ""
                        }
                      >
                        <td className="border-b border-border/50 px-2 py-1.5">{i + 1}</td>
                        <td className="border-b border-border/50 px-2 py-1.5 font-mono">
                          {row.resolved.sku}
                        </td>
                        <td className="border-b border-border/50 px-2 py-1.5">
                          {row.resolved.name}
                        </td>
                        <td className="border-b border-border/50 px-2 py-1.5">
                          {row.raw["Kategori"] ?? "—"}
                        </td>
                        <td className="border-b border-border/50 px-2 py-1.5">
                          {row.status === "valid" && (
                            <span className="text-success flex items-center gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Valid
                            </span>
                          )}
                          {row.status === "auto_create" && (
                            <span className="text-info flex items-center gap-1">
                              <Sparkles className="h-3 w-3" /> Akan dibuat baru
                            </span>
                          )}
                          {row.status === "duplicate" && (
                            <span className="text-warning flex items-center gap-1">
                              <TriangleAlert className="h-3.5 w-3.5" /> Duplikat
                            </span>
                          )}
                          {row.status === "error" && (
                            <span className="text-destructive flex items-center gap-1">
                              <XCircle className="h-3.5 w-3.5" /> Error
                            </span>
                          )}
                        </td>
                        <td className="border-b border-border/50 px-2 py-1.5">
                          {row.status === "duplicate" ? (
                            <button
                              onClick={() => toggleAction(i)}
                              className="text-xs underline text-primary hover:text-primary/80"
                            >
                              {row.action === "update" ? "Skip →" : "Update →"}
                            </button>
                          ) : row.status === "valid" || row.status === "auto_create" ? (
                            <span className="text-muted-foreground">Create</span>
                          ) : null}
                        </td>
                        <td className="border-b border-border/50 px-2 py-1.5 text-xs">
                          {row.status === "auto_create" ? (
                            <span className="text-info">
                              <Sparkles className="mr-1 inline h-3.5 w-3.5" />
                              Akan dibuat baru:
                              {row.autoCreateCat?.checked && ` Kategori '${row.autoCreateCat.name}'`}
                              {row.autoCreateMerk?.checked && ` Merk '${row.autoCreateMerk.name}'`}
                              {row.autoCreateUnit?.checked &&
                                ` Satuan '${row.autoCreateUnit.name}'`}
                              {row.warnings.length > 0 &&
                                row.warnings.map((w, wi) => (
                                  <span key={wi} className="block text-warning flex items-center gap-1">
                                    <TriangleAlert className="h-3 w-3 shrink-0" /> {w}
                                  </span>
                                ))}
                            </span>
                          ) : row.warnings.length > 0 ? (
                            <span className="text-warning">
                              {row.warnings.map((w, wi) => (
                                <span key={wi} className="block flex items-center gap-1">
                                  <TriangleAlert className="h-3 w-3 shrink-0" /> {w}
                                </span>
                              ))}
                            </span>
                          ) : (
                            <span className="text-destructive">
                              {row.errors.filter((e) => !e.startsWith("Duplikat SKU")).join("; ") ||
                                "—"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          {parsedRows && (
            <Button className="rounded-xl" disabled={!canSubmit} onClick={handleSubmit}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Import {stats.valid + stats.duplicate + stats.autoCreate} Barang
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
