<?php

namespace App\Services\Ai;

use App\Http\Middleware\EnsureWarehouseScope;
use App\Models\Customer;
use App\Models\Item;
use App\Models\ItemStock;
use App\Models\StockDocument;
use App\Models\Supplier;
use App\Models\User;
use App\Models\Warehouse;
use App\Support\WarehouseScope;
use Illuminate\Support\Facades\Log;

/**
 * Eksekutor tool AI (F8.2). Dua kelas:
 *
 * - READ (readOnly=true): query model langsung — GLOBAL SCOPE warehouse
 *   (F7) otomatis berlaku, jadi user Terbatas tak bisa melihat gudang lain.
 * - WRITE (readOnly=false): TIDAK dieksekusi di sini. Mengembalikan deskriptor
 *   aksi (route + payload) yang akan dijalankan AiExecutor lewat route NYATA
 *   setelah konfirmasi user (menjamin RBAC + scope + validasi + audit identik
 *   dengan request normal).
 *
 * Handler read mengembalikan array ringkas (dikirim balik ke model sebagai
 * tool result). Hasil dibatasi ukurannya agar tak membanjiri konteks.
 */
final class AiToolHandler
{
    private const MAX_ROWS = 50;

    /**
     * Jalankan tool read. Tool tulis tak boleh lewat sini.
     *
     * @param  array<string, mixed>  $args
     */
    public function runRead(AiTool $tool, array $args, ?User $user = null): array
    {
        if (! $tool->readOnly) {
            throw new AiProviderException("Tool '{$tool->name}' bukan tool baca.");
        }

        return match ($tool->name) {
            'cari_barang' => $this->cariBarang($args),
            'stok_barang' => $this->stokBarang($args),
            'daftar_gudang' => $this->daftarGudang(),
            'daftar_dokumen_stok' => $this->daftarDokumenStok($args),
            'daftar_supplier' => $this->daftarSupplier($args),
            'daftar_customer' => $this->daftarCustomer($args),
            'analisis_data' => $this->analisisData($args, $user),
            default => throw new AiProviderException("Tool baca '{$tool->name}' tak dikenal."),
        };
    }

    /**
     * Analitik text-to-SQL (F8.5): guard reader + injeksi scope (opsi A) +
     * validator L0–L2 + allowlist tabel + eksekusi read-only.
     *
     * @param  array<string, mixed>  $args
     */
    private function analisisData(array $args, ?User $user = null): array
    {
        $sql = (string) ($args['sql'] ?? '');
        if (trim($sql) === '') {
            throw new AiProviderException('Query SQL kosong.');
        }

        $this->assertReaderConfigured();

        // Sumber scope: atribut middleware bila rute ter-scope (alur HTTP
        // normal); fallback resolusi langsung dari user (console/test atau
        // pemanggilan handler langsung). null = mode Semua (tanpa batas).
        $request = request();
        $ids = $request->attributes->has(EnsureWarehouseScope::ATTRIBUTE)
            ? EnsureWarehouseScope::idsFor($request)
            : ($user ? WarehouseScope::effectiveIdsFor($user) : null);

        try {
            if ($ids !== null) {
                // [] = fail-closed W11 (SqlScopeInjector menolak dengan pesan).
                $sql = SqlScopeInjector::apply($sql, $ids);
            }

            $result = app(SqlReadOnlyExecutor::class)->run($sql);
        } catch (\Throwable $e) {
            // Catat SQL penolakan/gagal (internal) agar perilaku model yang
            // menyimpang bisa diaudit tanpa menebak-nebak.
            Log::warning('AiAnalisisData: query analitik ditolak/gagal.', [
                'sql' => $sql,
                'error' => $e->getMessage(),
            ]);

            throw $e;
        }
        $result['penjelasan'] = (string) ($args['penjelasan'] ?? '');

        return $result;
    }

    /**
     * Fail-closed produksi: bila AI_ENFORCE_READER=true, analitik hanya jalan
     * bila koneksi ai_readonly memakai user DB khusus (bukan kredensial app).
     */
    private function assertReaderConfigured(): void
    {
        if (! (bool) config('ai.enforce_reader')) {
            return;
        }

        $default = (string) config('database.default', 'pgsql');
        $reader = (string) config('database.connections.ai_readonly.username', '');
        $app = (string) config("database.connections.{$default}.username", '');

        if ($reader === '' || $reader === $app) {
            throw new AiProviderException('Analitik AI belum dikonfigurasi administrator (role database read-only).');
        }
    }

    /**
     * @param  array<string, mixed>  $args
     * @return array<string, mixed>
     */
    private function cariBarang(array $args): array
    {
        $q = trim((string) ($args['query'] ?? ''));
        $limit = $this->limit($args['limit'] ?? 10);

        $query = Item::query()->with(['unit:id,name', 'warehouse:id,name']);
        if ($q !== '') {
            $needle = strtolower($q);
            $query->where(function ($w) use ($needle) {
                $w->whereRaw('LOWER(name) LIKE ?', ["%{$needle}%"])
                    ->orWhereRaw('LOWER(sku) LIKE ?', ["%{$needle}%"])
                    ->orWhereRaw('LOWER(barcode) LIKE ?', ["%{$needle}%"])
                    ->orWhereRaw('LOWER(internal_barcode) LIKE ?', ["%{$needle}%"]);
            });
        }

        $rows = $query->orderBy('name')->limit($limit)->get();

        return [
            'count' => $rows->count(),
            // Keterbukaan cakupan: stok_total di sini adalah angka GLOBAL
            // (seluruh gudang). Untuk stok per gudang yang ter-scope, model
            // harus memakai tool stok_barang.
            'scope_note' => 'stok_total adalah total global; gunakan stok_barang untuk angka per gudang sesuai akses Anda.',
            'items' => $rows->map(fn (Item $i) => [
                'id' => $i->id,
                'sku' => $i->sku,
                'nama' => $i->name,
                'satuan' => $i->unit?->name,
                'status' => $i->status,
                'stok_total' => (int) $i->stock,
                // Disertakan agar AI bisa langsung membandingkan stok vs minimum
                // TANPA perlu query analitik (dan tanpa menebak nama kolom).
                'stok_minimum' => (int) $i->min_stock,
                'stok_maksimum' => $i->max_stock !== null ? (int) $i->max_stock : null,
                'di_bawah_minimum' => (int) $i->stock < (int) $i->min_stock,
                'selisih_minimum' => (int) $i->min_stock - (int) $i->stock,
                'gudang_default' => $i->warehouse?->name,
            ])->all(),
        ];
    }

    /**
     * @param  array<string, mixed>  $args
     * @return array<string, mixed>
     */
    private function stokBarang(array $args): array
    {
        // Kumpulkan id (item_id tunggal atau item_ids array).
        $ids = [];
        if (isset($args['item_id'])) {
            $ids[] = (int) $args['item_id'];
        }
        foreach (($args['item_ids'] ?? []) as $id) {
            $ids[] = (int) $id;
        }
        $ids = array_values(array_unique(array_filter($ids)));

        $query = ItemStock::query()
            ->with(['item:id,sku,name,unit_id,min_stock,max_stock', 'warehouse:id,name', 'bin:id,code'])
            ->where('stock', '>', 0);

        if ($ids !== []) {
            $query->whereIn('item_id', $ids);
        }
        if (isset($args['warehouse_id'])) {
            $query->where('warehouse_id', (int) $args['warehouse_id']);
        }

        $rows = $query->orderBy('item_id')->limit(self::MAX_ROWS)->get();

        return [
            'count' => $rows->count(),
            'scope_note' => 'Hasil sudah dibatasi ke gudang yang boleh diakses Anda.',
            'rows' => $rows->map(fn (ItemStock $s) => [
                'item_id' => $s->item_id,
                'sku' => $s->item?->sku,
                'nama' => $s->item?->name,
                'gudang' => $s->warehouse?->name,
                'bin' => $s->bin?->code ?? '(lantai/gudang)',
                'stok' => (int) $s->stock,
                'reserved' => (int) $s->reserved,
                'stok_minimum' => (int) ($s->item?->min_stock ?? 0),
            ])->all(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function daftarGudang(): array
    {
        // Warehouse TIDAK di-scope global; filter manual by WarehouseScope
        // agar user Terbatas hanya melihat gudangnya (konsisten F7.5).
        // request()->user() null di luar HTTP (test/command) → fallback auth().
        $user = request()->user() ?? auth()->user();
        $allowed = $user ? WarehouseScope::effectiveIdsFor($user) : null;

        $query = Warehouse::query()->where('is_active', true)->orderBy('name');
        if ($allowed !== null) {
            $query->whereIn('id', $allowed);
        }

        $rows = $query->get(['id', 'code', 'name', 'city']);

        return [
            'count' => $rows->count(),
            'warehouses' => $rows->map(fn (Warehouse $w) => [
                'id' => $w->id, 'code' => $w->code, 'nama' => $w->name, 'kota' => $w->city,
            ])->all(),
        ];
    }

    /**
     * @param  array<string, mixed>  $args
     * @return array<string, mixed>
     */
    private function daftarDokumenStok(array $args): array
    {
        $limit = $this->limit($args['limit'] ?? 15);

        $query = StockDocument::query()->with(['warehouse:id,name', 'destination:id,name']);
        if (! empty($args['search'])) {
            $needle = strtolower((string) $args['search']);
            $query->where(function ($w) use ($needle) {
                $w->whereRaw('LOWER(no) LIKE ?', ["%{$needle}%"])
                    ->orWhereRaw('LOWER(partner) LIKE ?', ["%{$needle}%"]);
            });
        }
        if (! empty($args['type'])) {
            $query->where('type', (string) $args['type']);
        }
        if (! empty($args['status'])) {
            $query->where('status', (string) $args['status']);
        }
        if (! empty($args['warehouse_id'])) {
            $query->where('warehouse_id', (int) $args['warehouse_id']);
        }

        $rows = $query->orderByDesc('document_date')->orderByDesc('id')->limit($limit)->get();

        return [
            'count' => $rows->count(),
            'documents' => $rows->map(fn (StockDocument $d) => [
                'id' => $d->id,
                'no' => $d->no,
                'tipe' => $d->type,
                'status' => $d->status,
                'tanggal' => optional($d->document_date)->toDateString(),
                'gudang' => $d->warehouse?->name,
                'tujuan_gudang' => $d->destination?->name,
                'partner' => $d->partner,
            ])->all(),
        ];
    }

    /**
     * @param  array<string, mixed>  $args
     * @return array<string, mixed>
     */
    private function daftarSupplier(array $args): array
    {
        return $this->lookupNames(Supplier::query(), $args, 'suppliers');
    }

    /**
     * @param  array<string, mixed>  $args
     * @return array<string, mixed>
     */
    private function daftarCustomer(array $args): array
    {
        return $this->lookupNames(Customer::query(), $args, 'customers');
    }

    /**
     * @param  \Illuminate\Database\Eloquent\Builder<*>  $query
     * @param  array<string, mixed>  $args
     * @return array<string, mixed>
     */
    private function lookupNames($query, array $args, string $key): array
    {
        $q = trim((string) ($args['query'] ?? ''));
        if ($q !== '') {
            $needle = strtolower($q);
            $query->whereRaw('LOWER(name) LIKE ?', ["%{$needle}%"]);
        }
        $rows = $query->orderBy('name')->limit($this->limit($args['limit'] ?? 10))->get(['id', 'name', 'code']);

        return [
            'count' => $rows->count(),
            $key => $rows->map(fn ($r) => ['id' => $r->id, 'nama' => $r->name])->all(),
        ];
    }

    private function limit(mixed $raw): int
    {
        $n = (int) ($raw ?? 10);

        return max(1, min($n, self::MAX_ROWS));
    }
}
