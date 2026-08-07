# Backend — Kelola Gudang Pro

Laravel 13 API (`/api`) powering the master data module (Kategori, Sub Kategori, Barang). The frontend (`Frontend/`) calls this API for those pages; the rest of the app is still UI-only dummy data.

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
- `index` supports `search`, per-entity filters, and `per_page`. Responses use Laravel's default envelope: `{ data }` for single, `{ data, links, meta }` for paginated collections.
- Resources serialize to match the frontend shapes (`src/lib/master-types.ts`); e.g. ItemResource maps `min_stock→min`, `max_stock→max`, `lead_time→leadTime`, relation names→`category`/`subCategory`. It also exposes raw `category_id`/`sub_category_id` so the edit form can prefill selects. Fields for not-yet-built relations return `null`.
- The frontend proxies `/api` → `http://127.0.0.1:8000` in dev (see `Frontend/vite.config.ts`), so both servers must run: `composer dev` (this dir) + `npm run dev` (in `Frontend/`).
- Validation in `app/Http/Requests` (FormRequests); `code`/`sku`/`barcode` are unique with `Rule::unique(...)->ignore()` on update.
- Deleting a category that still has sub-categories/items is blocked (FK restrict → 422).

## Schema notes

- `items.stock`/`items.reserved` are denormalized for now; they will normalize to an `ITEM_STOCK` table (composite PK `item_id, warehouse_id, bin_id`) when the Persediaan module is built.
- `items.brand_id`, `unit_id`, `preferred_supplier_id`, `default_warehouse_id`, `default_rack_id`, `default_bin_id` exist but have **no FK constraints yet** — those master tables ship in later phases. Adding those phases: create the tables, add the FK constraints, backfill items.
- Item belongsTo Category (required) and SubCategory (nullable). SubCategory belongsTo Category (cascade delete).
