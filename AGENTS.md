# Kelola Gudang Pro

Warehouse Management System (WMS) monorepo. Two sibling sub-projects with **no root manifest** and **no git repo** at any level. Each sub-project has its own detailed AGENTS.md — read the relevant one before touching its code.

- `Frontend/` — the active product: TanStack Start + React 19 UI demo (Indonesian UI). `Frontend/AGENTS.md` is authoritative and detailed — commands, routing, tooling gotchas, and data conventions live there.
- `Backend/` — Laravel 13 API powering the master data module (Kategori, Sub Kategori, Barang — API-backed since 2026). `Backend/AGENTS.md` holds the API conventions, schema notes, and env setup.

## Running the app

Dev loop needs **TWO servers**:

- Laravel API: `composer dev` in `Backend/` → `http://127.0.0.1:8000` (also runs queue:listen + pail + npm run dev).
- Frontend: `npm run dev` in `Frontend/` → `http://localhost:8081`. Vite proxies `/api` → `http://127.0.0.1:8000` (`vite.config.ts`). If master pages show "Tidak dapat terhubung ke server backend", the Laravel server isn't running.

Convenience wrapper: `./dev.sh` at the root starts both servers (logs to `.dev/logs/`), verifies ports 8000/8081 are free first, and kills both on Ctrl+C. Prefer this over running the two loops separately.

## Frontend

UI-only WMS demo — deterministic dummy data from `src/lib/wms-data.ts` (seeded PRNG), except the API-backed master pages. Managed by **bun** (both `bun.lock` and `package-lock.json` must stay in sync). No typecheck script — use `npx tsc --noEmit`. The real product requirements are in `Frontend/README.md`. Full details in `Frontend/AGENTS.md`.

## Backend (Laravel 13)

PostgreSQL 18 at `127.0.0.1:5432` (user `postgres`, password `postgres`), **NOT on PATH** — use full path `C:/Program Files/PostgreSQL/18/bin/psql.exe` (`createdb.exe`). Dev DB `kelolagudang`, test DB `kelolagudang_test` (per `phpunit.xml`). `items.stock`/`reserved` are denormalized today and will move to an `ITEM_STOCK` table (composite PK `item_id, warehouse_id, bin_id`) with the Persediaan module. Full commands, API conventions, and schema notes in `Backend/AGENTS.md`.
