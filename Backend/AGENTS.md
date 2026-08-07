# Backend — Kelola Gudang Pro

Laravel 13 API (`/api`) powering the master data module (Kategori, Sub Kategori, Merk, Satuan, Gudang, Rak, Bin, Supplier, Customer, Vendor, Barang, Departemen, Proyek, Work Order). The frontend (`Frontend/`) calls this API for those pages; the rest of the app is still UI-only dummy data.

## Stack & environment

- PHP ^8.3 (Laragon), Laravel 13.24.
- **PostgreSQL 18** at `127.0.0.1:5432`, user `postgres` / password `postgres`.
  - NOT on PATH — use full path `C:/Program Files/PostgreSQL/18/bin/psql.exe` / `createdb.exe`.
  - Dev DB `kelolagudang`, test DB `kelolagudang_test` (defined in `phpunit.xml`).
  - First-time: `CREATE DATABASE kelolagudang; CREATE DATABASE kelolagudang_test;` via psql (do this before `migrate`/`setup`).
- `.npmrc` sets `ignore-scripts=true` — npm deps never run postinstall scripts.
- `laravel/boost` is NOT installed (README mentions it; ignore).

## Commands

```sh
composer setup          # install deps, .env, key:generate, migrate, build assets
composer dev            # php artisan serve + queue:listen + pail + npm run dev
composer test           # = php artisan test (PHPUnit 12, PostgreSQL kelolagudang_test)
php artisan test --filter=Name
vendor/bin/phpunit tests/Feature/FooTest.php
vendor/bin/pint         # formatting (default laravel preset, no pint.json)
php artisan migrate --seed
```

## API conventions

- Routes live in `routes/api.php` (registered via `withRouting(api: ...)` in `bootstrap/app.php`). No auth yet — endpoints are open; USER/ROLE/PERMISSION ship later.
- Controllers follow `apiResource` style: `index` (list), `store`, `show`, `update`, `destroy`.
- **Non-`apiResource` extras** on `items`: `POST /api/master/items/bulk-delete` and `POST /api/master/items/bulk-status` (`ItemController::bulkDestroy` / `bulkUpdateStatus`, validated by `BulkItemDeleteRequest` / `BulkItemStatusRequest`).
- `index` supports `search`, per-entity filters, and `per_page`. Responses use Laravel's default envelope: `{ data }` for single, `{ data, links, meta }` for paginated collections.
- Resources serialize to match the frontend shapes (`src/lib/master-types.ts`); e.g. ItemResource maps `min_stock→min`, `max_stock→max`, `lead_time→leadTime`, relation names→`category`/`subCategory`. It also exposes raw `category_id`/`sub_category_id` so the edit form can prefill selects. Fields for not-yet-built relations return `null`.
- The frontend proxies `/api` → `http://127.0.0.1:8000` in dev (see `Frontend/vite.config.ts`), so both servers must run: `composer dev` (this dir) + `npm run dev` (in `Frontend/`).
- Validation in `app/Http/Requests` (FormRequests); `code`/`sku`/`barcode` are unique with `Rule::unique(...)->ignore()` on update.
- CORS is enabled via `config/cors.php` (`allowed_origins: *`, `supports_credentials: false`) so the Vercel-deployed frontend can call the ngrok tunnel (`dev.sh`) cross-origin. Tighten origins once auth ships.
- Deleting a category that still has sub-categories/items, a rack with bins/items, a bin with items, a warehouse with racks/items, a supplier still referenced by items, or a project still referenced by work orders is blocked (422). Deleting an **item** referenced by a work order is also blocked (422) — `ItemController::destroy`/`bulkDestroy` guards on `items`→`work_orders` (`restrictOnDelete`).
- **`users` is read-only**: only `GET /api/master/users` (index with `search`) is exposed; no store/update/delete routes (POST→405, DELETE→404). `/api/master/departments`, `/api/master/projects`, `/api/master/work-orders` are full `apiResource` CRUD.
- Resources for relation fields use the **string-name + raw FK** pattern (like `ItemResource`): e.g. `head`/`pic`/`project`/`item`/`unit` render the related record's `name`/`code` via `whenLoaded(fn () => $this->project?->name)`, and raw FKs (`head_user_id`, `pic_user_id`, `project_id`, `item_id`, `unit_id`) are exposed for form prefill. `ProjectResource` also exposes `work_orders_count` via `whenCounted`.

## Schema notes

- `items.stock`/`items.reserved` are denormalized for now; they will normalize to an `ITEM_STOCK` table (composite PK `item_id, warehouse_id, bin_id`) when the Persediaan module is built.
- `items.brand_id` has an FK to `merks` (nullable, `nullOnDelete`). `default_rack_id`/`default_bin_id` are FKs to `racks`/`bins` (nullable, `nullOnDelete`). `preferred_supplier_id` is an FK to `suppliers` (nullable, `nullOnDelete`) and resolves to the supplier `name` via ItemResource `supplier` when loaded. `unit_id` and `default_warehouse_id` exist but still have **no FK constraints yet** — those master tables ship in later phases (adding: create the table, add the FK, backfill items).
- `racks` belongsTo `warehouses` (`cascadeOnDelete`) and hasMany `bins` (`cascadeOnDelete`) / `items` via `default_rack_id`. `bins` hasMany `items` via `default_bin_id`. `suppliers` hasMany `items` via `preferred_supplier_id`. Codes auto-generate via `CodeGenerator` (`RAK-###`, `BIN-###`, `SUP-###`, `CUS-###`, `VDR-###`) when omitted.
- Item belongsTo Category (required), SubCategory (nullable), and Supplier (nullable). SubCategory belongsTo Category (cascade delete).
- `payment_terms` (suppliers) is `Rule::in(['NET 30','NET 14','COD','NET 45'])`, `segment` (customers) is `Rule::in(['Retail','Distributor','Proyek','Korporat'])`, `service_type` (vendors) is `Rule::in(['Ekspedisi','Maintenance','Kalibrasi','Cleaning'])` — all nullable.
- `departments` (code `DEP-###` UK, name UK, `head_user_id`→users `nullOnDelete`, `is_active`), `projects` (code `PRJ-###` UK, name UK, `pic_user_id`→users `nullOnDelete`, `start_date`/`end_date` nullable, `status` `Rule::in(['Perencanaan','Berjalan','Selesai'])`, `budget` decimal(15,2) nullable), and `work_orders` (no `WO-###` UK, `project_id`→projects `cascadeOnDelete`, `item_id`→items **`restrictOnDelete`**, `unit_id`→units `nullOnDelete`, `target_qty` int, `start_date`/`finish_date` nullable, `pic_user_id`→users `nullOnDelete`, `status` `Rule::in(['Perencanaan','Berjalan','Selesai','Ditunda'])`). Codes auto-generate via `CodeGenerator` (`DEP-###`, `PRJ-###`, `WO/2026/####`). Seeders reference the 6 PIC users from `UserSeeder` (`Agus Salim`, `Bayu Pratama`, `Dewi Lestari`, `Nur Hidayat`, `Rudi Hartono`, `Siti Aminah`).
