# Desain Laporan Barang Masuk & Barang Keluar

Dokumen desain untuk mengubah halaman `laporan/barang-masuk` dan `laporan/barang-keluar`
dari data dummy statis menjadi laporan sungguhan berbasis API `GET /api/persediaan/stock-documents`.

Status: **disetujui — menunggu implementasi** (atau *implemented*, per kesepakatan terakhir).
Lingkup: hanya 2 halaman laporan tersebut. 8 laporan lain di `laporan.$report.tsx` tidak tersentuh.

---

## 1. Ringkasan

| Aspek | Nilai |
| --- | --- |
| Endpoint | `GET /api/persediaan/stock-documents` |
| Type yang dipakai | `Penerimaan` (Barang Masuk) dan `Pengeluaran` (Barang Keluar) |
| Otentikasi | Bearer token (`kg-token`) via `src/lib/api.ts`; butuh `role.access: Persediaan` Baca |
| Pendekatan | **Server-side scoping** (type + rentang tanggal + gudang) + **filter client** (cari / partner / status) |
| Komponen baru | `src/components/wms/laporan-barang-masuk-keluar.tsx` |
| Perubahan lain | `use-persediaan.ts` (param `from`/`to` + `placeholderData`), `laporan.$report.tsx` (branch), `csv.ts` (sanitasi formula) |

## 2. Kondisi saat ini (masalah)

Saat ini kedua laporan jatuh ke cabang *dummy* umum di `laporan.$report.tsx:139-146`:

1. Data berasal dari `transactions.slice(0, 500)` (`src/lib/wms-data.ts`) — **tidak difilter berdasarkan
   jenis dokumen**, sehingga laporan Barang Masuk dan Barang Keluar menampilkan campuran transaksi.
2. Input tanggal (`laporan.$report.tsx:283`) memakai `defaultValue` dan **tidak berfungsi** (uncontrolled, tak
   terhubung ke logika apa pun).
3. Stat cards memakai angka global dummy (`totalValue`, `monthly`), chart menampilkan seri Masuk+Keluar sekaligus,
   dan tombol **Excel / PDF / Print hanya memunculkan toast palsu** (`laporan.$report.tsx:195-208`).
4. Tidak ada drill-down (klik baris), tidak ada kolom partner/referensi/PIC/status, dan tanpa gate RBAC.

## 3. Keputusan desain + referensi

### 3.1 Server-side scoping dengan `placeholderData: keepPreviousData`
- Query dibatasi di server oleh `type`, `from`, `to`, dan `warehouse_id` (bila gudang dipilih).
  Cache TanStack Query dikunci oleh `["persediaan","stock-documents","list", type, status, warehouseId, search, from, to, perPage]`.
- Saat user mengganti rentang/gudang, `placeholderData: keepPreviousData` membuat data lama tetap tampil sampai
  data baru tiba; flag `isFetching` menandai pemuatan. Ini pola resmi TanStack Query v5
  (panduan *Paginated Queries*: `placeholderData: keepPreviousData` menggantikan `keepPreviousData: true` v4).
- Menghindari "flash loading" / tabel kosong setiap ganti filter.

### 3.2 Filter client
- **Cari**: teks bebas (no, supplier/tujuan, gudang, PIC, tanggal, referensi, status) via
  `buildStockDocumentSearchText` (`src/lib/stock-document-search.ts`) + `useDebouncedValue` (250ms).
- **Partner**: dropdown unik dari `doc.partner` pada hasil fetch (label Supplier untuk Masuk, Tujuan untuk Keluar).
- **Status**: dari `stockDocumentStatuses`. Konstanta `ALL` untuk nilai "semua".

### 3.3 Stat cards dihitung dari hasil fetch
- Endpoint `summary()` (`/persediaan/stock-documents/summary`) hanya global tanpa filter → **tidak bisa** dipakai
  untuk kartu yang mencerminkan rentang/filter. Karena itu kartu dihitung dari baris hasil fetch yang sudah
  terfilter:
  - Total Dokumen (`rows.length`)
  - Total Qty (jumlah `Math.abs(qty_total)`)
  - Total Nilai (jumlah `Math.abs(value_total)`)
  - Rata-rata Qty/Bulan (total qty / jumlah bulan berbeda dalam data)
- `qty_total`/`value_total` Barang Keluar bernilai negatif (arah OUT) → selalu pakai `Math.abs`, konsisten dengan
  `transaksi-keluar.tsx:110-118`.

### 3.4 Chart: satu seri (recharts)
- `ResponsiveContainer` → `BarChart` → `XAxis` / `YAxis` / `Tooltip` / `Bar` — pola resmi recharts dan sudah
  dipakai di `laporan.$report.tsx:289-309`.
- **Satu seri** "Qty" per bulan (`Math.abs`), disusun ascending per `YYYY-MM`. Label bulan memakai locale id-ID.
- `Tooltip` diformat dengan `formatNumber`.

### 3.5 CSV export
- Memakai `toCsv`/`downloadCsv` (`src/lib/csv.ts`): UTF-8 BOM agar terbuka benar di Excel, CRLF, escaping koma/quote.
- CSV **mencerminkan filter aktif** (baris hasil filter saat ini), dengan blok metadata di baris pertama
  (judul laporan, rentang tanggal, filter gudang/partner/status, waktu generate).
- **Sanitasi formula-injection** (OWASP / panduan export standar): sel teks yang diawali `=`, `+`, `-`, `@`
  diberi prefiks `'` agar tidak dieksekusi sebagai formula. Kolom numerik diformat sebagai angka (Rp/koma ribuan)
  sehingga tidak terkena aturan ini (nilai negatif dihitung `abs` sebelum export).

### 3.6 Print
- **Satu alur print**: `window.open("", "_blank", ...)` → tulis HTML → `win.document.close()` → `win.focus()` →
  `setTimeout(win.print, 150)`. Precedent: `printProcDoc` di `purchase-request-sheet.tsx:76-136`.
- Ditampilkan header laporan, periode, tabel baris hasil filter, total, dan footer "Dicetak: …".

### 3.7 RBAC
- Grup menu Laporan di `nav.ts` tidak membawa `module`, sehingga `app-shell` tidak menggating 2 rute ini.
- Komponen menggating sendiri dengan `hasModuleLevel("Persediaan", "Baca")` dari `useAuth`; bila tidak punya,
  tampilkan pesan tanpa akses dan **tidak melakukan fetch** (`enabled: canView`).

## 4. Arsitektur

```
laporan/$report (laporan.$report.tsx)
  ├─ report === "barang-masuk"        → <LaporanBarangMasukKeluar type="Penerimaan" />
  ├─ report === "barang-keluar"       → <LaporanBarangMasukKeluar type="Pengeluaran" />
  └─ lainnya                          → UI generik lama (tidak berubah)

LaporanBarangMasukKeluar (baru)
  ├─ useStockDocuments({ type, warehouseId, from, to })   ← server scope + keepPreviousData
  ├─ useWarehouses()                                      ← id untuk server scope gudang
  ├─ filter client: cari / partner / status
  ├─ StatCards (4) dari rows terfilter
  ├─ BarChart 1 seri Qty/bulan dari rows terfilter
  ├─ DataTable + klik baris → useStockDocument → StockDocumentSheet
  ├─ CSV via downloadCsv(toCsv(...))  (+ blok metadata + sanitasi formula)
  └─ Print via window.print pattern (printProcDoc)
```

Alur data:

```
pengguna pilih rentang/gudang ──► queryKey berubah ──► refetch (keepPreviousData)
hasil fetch ──► filter client (cari/partner/status) ──► rows
rows ──► stat cards, chart bulanan, tabel (drill-down sheet), CSV, print
```

## 5. Detail implementasi

### 5.1 `use-persediaan.ts` — tambah `from`/`to` + `placeholderData`
- Parameter baru: `from?: string | null`, `to?: string | null` (format `YYYY-MM-DD`).
- Masuk ke queryKey dan query string (`from=…&to=…`).
- Tambah `placeholderData: keepPreviousData` (import dari `@tanstack/react-query`) pada `useStockDocuments`.
  Aman untuk pemakai lain (transaksi-masuk, mutasi, dll.) — hanya menahan data lama saat queryKey berubah.

### 5.2 `laporan-barang-masuk-keluar.tsx` (komponen baru)

Props:
```ts
export function LaporanBarangMasukKeluar({
  type,
}: {
  type: "Penerimaan" | "Pengeluaran";
})
```

State:
- `q` + `debouncedQ`, `wh` (ALL | nama gudang), `partner` (ALL), `status` (ALL)
- `from`/`to` (string `YYYY-MM-DD`), default: hari ini & 12 bulan ke belakang (awal bulan)
- `selectedId: number | null` untuk `StockDocumentSheet`

Fetch:
- `whId = warehouses?.data.find(w => w.name === wh)?.id ?? null` (null = semua)
- `useStockDocuments({ type, warehouseId: whId, from, to, enabled: canView && from && to && from <= to })`

Kolom tabel (`Column<StockDocumentApi>`, `sortable`, `onRowClick` → sheet):
| Kolom | Kunci | Rendering |
| --- | --- | --- |
| Nomor | `no` | mono teks-primary |
| Tanggal | `document_date` | `formatDate` |
| Gudang | `warehouse` | `?? "—"` |
| Partner (Supplier/Tujuan) | `partner` | `?? "—"` |
| Referensi | `reference_no` | `?? "—"` |
| Qty | `qty_total` | `formatNumber(Math.abs(…))` |
| Nilai | `value_total` | `formatIDR(Math.abs(…))` |
| PIC | `pic` | `?? "—"` |
| Status | `status` | `<Pill tone>` (success/neutral/danger/warning) |

`mobileCard` wajib untuk `DataTable` (pola `transaksi-masuk.tsx:194-209`).

Chart data:
- `monthKey = iso.slice(0, 7)` → kumpulkan `{ key, qty }`, urut ascending, label `formatDate` bulan pertama.
- `Bar dataKey="qty" name="Qty" fill="var(--primary)" radius={[6,6,0,0]}`.

CSV:
- Blok metadata: `[["Laporan", title], ["Periode", "…"], ["Filter", "…"], ["Dicetak", new Date().toLocaleString("id-ID")]]`.
- Baris data: Nomor, Tanggal, Tipe, Gudang, Partner, Referensi, Qty (abs, `formatNumber`), Nilai (abs, `formatIDR`), PIC, Status.
- `downloadCsv(\`laporan-barang-${type === "Penerimaan" ? "masuk" : "keluar"}-${from}-${to}.csv\`, csv)`.

Print:
- HTML dengan judul, periode, tabel baris (abs), total, footer. Alur `printProcDoc`.

RBAC:
- `const { hasModuleLevel } = useAuth(); const canView = hasModuleLevel("Persediaan", "Baca");`
- Bila `!canView`: render `EmptyState` "Anda tidak memiliki akses ke laporan ini" + blokir fetch.

### 5.3 `laporan.$report.tsx` — branch
- Import komponen baru; di dalam `Laporan()`:
```ts
if (report === "barang-masuk") return <LaporanBarangMasukKeluar type="Penerimaan" />;
if (report === "barang-keluar") return <LaporanBarangMasukKeluar type="Pengeluaran" />;
```
- Judul `<head>` (`titles`) tetap dipakai dan sudah benar: "Laporan Barang Masuk / Barang Keluar".
- Cabang generik (opname/item/transaksi dummy) tetap untuk 8 laporan lain.

### 5.4 `csv.ts` — sanitasi formula-injection
- Di `escapeCell`, setelah konversi ke string, jika diawali `=`, `+`, `-`, `@` → prefiks `'`.
- Header/label aman; sel numerik dipakai via nilai terformat (abs), sehingga aturan ini tidak mengubah angka.

## 6. Pengujian

1. **Rentang & gudang (server)**: ubah `from`/`to` dan pilih gudang → tabel/stat/chart berubah, tanpa flash
   (data lama tetap tampil saat `isFetching`).
2. **Filter client**: cari teks, pilih partner, pilih status → baris/stat/CSV ikut terfilter.
3. **Drill-down**: klik baris → `StockDocumentSheet` terbuka dengan detail + baris dokumen.
4. **CSV**: unduh, buka di Excel → encoding benar (BOM), kolom numerik benar, nilai negatif tampil abs,
   sel teks diawali `=+-@` aman (tidak jadi formula).
5. **Print**: klik Print → jendela baru berisi laporan → dialog print muncul.
6. **RBAC**: login akun tanpa akses `Persediaan` (mis. role tanpa modul itu) → halaman menampilkan pesan
   tanpa akses, tidak ada panggilan API. Akun Administrator → laporan normal.

## 7. File yang berubah

| File | Perubahan |
| --- | --- |
| `Frontend/docs/desain-laporan-barang-masuk-keluar.md` | (baru) dokumen ini |
| `Frontend/src/hooks/use-persediaan.ts` | `useStockDocuments`: param `from`/`to`, `placeholderData: keepPreviousData` |
| `Frontend/src/components/wms/laporan-barang-masuk-keluar.tsx` | (baru) komponen laporan parameterized by type |
| `Frontend/src/routes/laporan.$report.tsx` | branch `barang-masuk` / `barang-keluar` → komponen baru |
| `Frontend/src/lib/csv.ts` | sanitasi formula-injection di `escapeCell` |