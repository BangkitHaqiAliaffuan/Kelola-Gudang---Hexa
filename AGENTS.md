# Kelola Gudang Pro

WMS monorepo — no root manifest (stray root `package-lock.json`, ignore it). Git lives at root (`main`); commit from root, never inside `Frontend/`/`Backend/`. Lovable-connected → never force-push / rebase / amend pushed history. Two siblings: `Frontend/` (TanStack Start + React 19, Indonesian UI) and `Backend/` (Laravel 13 API). Read `Frontend/AGENTS.md` / `Backend/AGENTS.md` before touching that side — they are authoritative, this file is only the cross-cutting surface. Linux setup: `Frontend/docs/catatan-linux-min.md`.

## Running (two servers required)

- Backend `composer dev` in `Backend/` → `http://127.0.0.1:8000`. Frontend `npm run dev` in `Frontend/` → `http://localhost:8080` (8080 injected by `@lovable.dev/vite-tanstack-config`). Vite proxies `/api` + `/sanctum` → `8000` (`Frontend/vite.config.ts`); "Tidak dapat terhubung ke server backend" means Laravel is down.
- `./dev.sh` is a thin wrapper: plain `php artisan serve` + `npm run dev` (no queue/pail — `composer dev` is the full loop). Logs to `.dev/logs/`, kills on Ctrl+C, aborts if 8000/8080 already busy. Git Bash/MSYS on Windows, not PowerShell. `SKIP_TUNNEL=1 ./dev.sh` skips ngrok.
- Prod is same-origin: `VITE_API_URL` stays **unset** (fallback `/api` in `Frontend/src/lib/api.ts`). `Frontend/vercel.json` rewrites `/api/*` + `/sanctum/*` → ngrok URL; `dev.sh` auto-replaces the destination each restart → commit + redeploy Vercel after. Never hand-edit the destination, never set `VITE_API_URL` on Vercel. `Backend/config/cors.php` (`FRONTEND_URL`, `supports_credentials:false`) only matters for rare direct cross-origin calls.
- DB: **PostgreSQL 16** at `127.0.0.1:5432` (`postgres`/`postgres`). Dev `kelolagudang`, test `kelolagudang_test` (`Backend/phpunit.xml`). First-time: `CREATE DATABASE kelolagudang; CREATE DATABASE kelolagudang_test;`.

## Frontend

- Package manager **bun** (`bun.lock` + `package-lock.json` must stay in sync). `bunfig.toml` 24h `minimumReleaseAge` guard — deps <24h old fail until added to `minimumReleaseAgeExcludes` (confirm with user).
- In `Frontend/`: `npm run dev` (regenerates `routeTree.gen.ts`), `npm run lint` (`eslint .`, `no-unused-vars` OFF), `npm test` (`vitest run`, 5 specs), `npx tsc --noEmit` (no typecheck script). Playwright auto-starts both servers; only `e2e/auth.setup.ts` (needs `DEMO_PASSWORD` from `Backend/.env`) + read-only `e2e/screenshots/read-only.spec.ts`.
- `vite.config.ts` stays thin — the Lovable preset injects tanstackStart/viteReact/tailwind/nitro/etc. Only manual addition is `server.proxy`. `routeTree.gen.ts` is auto-generated, never edit.
- Routing file-based `src/routes/` with only `__root.tsx` layout. Generic `$section` routes dispatch via registries; API-backed slugs use dedicated static files that win: master `kategori…role` + `master/barang`; transaksi `masuk`/`keluar`/`transfer`/`retur-pembelian`/`retur-penjualan`; persediaan `stock`/`kartu-stock`/`mutasi`/`stock-minimum`/`nilai`/`adjustment`; opname `proses/$docId` + `laporan/$docId`; pengadaan `receive-goods` + `purchase-request`/`purchase-order` (→ `proc-docs`); `laporan/mutasi`. New menu item = registry slug **and** `src/components/wms/nav.ts`. Rest is seeded-PRNG dummy (`src/lib/wms-data.ts`); API hooks in `src/hooks/use-persediaan.ts`.
- Gotchas: TanStack Query needs `enabled: typeof window !== "undefined"` (SSR shell, hydrate client). `PER_PAGE=500` hard-coded, no server pagination. Strict tsconfig (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) → `arr[i]!`. Alias `@/*` → `src/*`. `DataTable` requires `mobileCard`. Reuse `kit.tsx` + `formatIDR`. Gudang filter `useWarehouseFilter()`: saved `kg-wh-filter:<userId>` → `default_warehouse_id` → Semua; lists read+write, forms read-only init. 8 pastel `data-theme` via `kg-theme` + oklch in `src/styles.css`, no `tailwind.config.*`. `master.barang.$id` has static SSR title and dummy Kartu Stock/Riwayat tabs (real kartu stock is `/persediaan/kartu-stock`).

## Backend

- PHP 8.3, Laravel 13. In `Backend/`: `composer dev` (serve+queue+pail+vite), `composer test` (= `php artisan test`, wipes `kelolagudang_test` via `RefreshDatabase`), `php artisan test --filter=Name`, `vendor/bin/pint`, `php artisan migrate` (never `migrate:fresh` — see below).
- Auth Sanctum **bearer-token only** (`POST /api/auth/login` throttle 5/min → `{data,access,token}`, `GET /api/auth/me`, `POST /api/auth/logout`); token in `localStorage` `kg-token` as `Authorization: Bearer`. No `statefulApi()`, no cookies/CSRF. Always send `ngrok-skip-browser-warning: true` (already in `src/lib/api.ts`).
- RBAC via `role.access` (`EnsureRoleAccess`), level from verb (GET=Baca, POST/PUT/PATCH=Tulis, DELETE=Kelola); missing `(role,module)` row = no access. `/api/master/*` → `Master Data`, `/api/persediaan/*` → `Persediaan`, `/api/pengadaan/*` → `Pengadaan`, `/api/laporan/*` → `Laporan` (seeded by `RolePermissionSeeder`). **Approve/unlock sit under plain `auth:sanctum`** (assignee-only, no module gate): persediaan `approve`/`reject`/`approve-review`/`reject-review`/`force-unlock`, pengadaan `proc-docs/{id}/approve`/`reject`.
- Envelope `{data}` / `{data,links,meta}`; validation in FormRequests; resources map `min_stock→min` etc. + raw FKs + string relation names for form prefill. `items` extras: `bulk-delete`, `bulk-status`, `bulk-import`. `stock-documents`: index/store/show/update only (no DELETE — cancel instead) + `summary` + `post`/`cancel`/`submit-approval`/`submit-review`/`lock`/`heartbeat`/`unlock`; `proc-docs`: CRUD + `submit`/`cancel`/`reassign`.
- Stock ledger: `items.stock`/`reserved` are denormalized; truth is `item_stock` (PK `item_id,warehouse_id,bin_id`) + `stock_movements`/`stock_documents`+lines via `StockLedger`/`StockDocumentService`. Opname posts 0 movements — finishing it creates an `ADJ` **Draft** (post later from `persediaan/adjustment`). Transfer writes an OUT+IN mirror pair (`pair_id`).

### Never run `migrate:fresh` — SANGAT PENTING
`migrate:fresh` (or any DB-wiping command) on dev DB `kelolagudang` is **FORBIDDEN** without explicit user instruction — wipes users/master/stock/`role_permissions`, breaks login ("Kredensial tidak cocok"). Use a new migration + `php artisan migrate`. If dev DB is empty, `php artisan db:seed` (every seeder has an `exists()` guard — re-run is a safe no-op). `UserSeeder` requires `DEMO_PASSWORD` in `Backend/.env` (throws if empty; never commit literal passwords — see `Frontend/docs/akun-login.md` + `.env.example`).

## Dokumentasi

- `Frontend/docs/`: manual/test docs always `.txt` (`tes-*`, `retest-*`, `testing-*`, `ringkasan-*`); specs/ERD/login stay `.md` (`erd-*`, `akun-login.md`, `catatan-linux-min.md`). Root `implementation_plan.md` exempt.
- Test docs are browser-manual guides in plain Bahasa Indonesia (`http://localhost:8080` + `http://127.0.0.1:8000`): `Buka menu → Klik → Isi → Simpan → Cek toast/tabel` + `[LULUS/GAGAL]` checklist. **DILARANG** `psql`/`SELECT`/`query`/`migrate:fresh --seed`/`db:seed`/`seeder`/`curl`/`GET /api` inside them — UI verification only. Technical `query`/`seeder`/`migrate --pretend` belongs in commit messages / `implementation_plan.md`, never in `*.txt`. Each `*.txt` needs: `Prasyarat (2 server + akun dari akun-login.md)` → `Langkah klik` → `Expected (toast/status/stok)` → `[LULUS/GAGAL]` → `Tanggal/Penguji/Catatan` footer.
- Test docs are **local worksheets** — keep them uncommitted. Never `stage` them unless the user explicitly asks (archive of a bug finding), then `git add <explicit-path>`.

## Git rules

- Never `git add`/`commit`/`push`/rewrite history (rebase/merge/amend/force-push) without explicit user instruction. When asked, `git add <explicit-path>` only for your task's files — never `git add .`/`-A`/`commit -a`, never sweep in other sessions' changes even with `commit` permission (unless user writes `commit all` or names the path).
- **`implementasikan`/`lanjutkan`/`fix`/`crosscheck`/`plan` ≠ izin commit/push** — those mean edit + verify (`npx tsc --noEmit` / `npm test` / `php artisan test`); stop at `git status`/`git diff` otherwise.
- Before commit: `git status` + line-by-line `git diff`/`--cached`; if foreign changes are staged, `git restore --staged <path>` and report. Scan for secrets (`authtoken`, `api[_-]?key`, `secret`, `password`, `token`, `APP_KEY`, AWS creds, `BEGIN .* PRIVATE KEY`, URL creds). Reject `.env*`, `*.key`/`*.pem`/`*.p12`, `ngrok.yml`, `.dev/` artifacts, build output (`dist`, `.output`, `.nitro`, `public/build`), `node_modules`. Keep `bun.lock`+`package-lock.json` in sync.

## Multi-session protocol

Multiple opencode sessions share one working tree / `main` / test DB / ports 8000+8080 — last-writer-wins.
1. Claim before editing: read `.dev/claims.md` (gitignored, create on demand) **before every edit**, add `| <path> | <role> | claimed |`; release to `done` when finished.
2. `git status` is live truth — uncommitted changes you didn't make belong to another session.
3. Serialize edits to the same file; never touch a `claimed` path.
4. Only one session at a time runs `./dev.sh` / `composer test` / `migrate` (port collision, `RefreshDatabase` wipes `kelolagudang_test`).
5. Small commits per task (only when asked), short claim windows. On conflict, stop and report.
