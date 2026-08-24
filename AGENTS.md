# Kelola Gudang Pro

WMS monorepo — **no root manifest**. Git at root (`main`, `https://github.com/BangkitHaqiAliaffuan/Kelola-Gudang---Hexa.git`); commit from root, not inside sub-projects. Lovable-connected → never force-push / rewrite published history. Two siblings: `Frontend/` (TanStack Start + React 19, Indonesian UI) and `Backend/` (Laravel 13 API). Read `Frontend/AGENTS.md` / `Backend/AGENTS.md` before touching that sub-project — they are authoritative.

## Running (two servers required)

- Backend: `composer dev` in `Backend/` → `http://127.0.0.1:8000` (serve + queue + pail + vite). Frontend: `npm run dev` in `Frontend/` → `http://localhost:8080` (8080 injected by `@lovable.dev/vite-tanstack-config`, not 8081). Vite proxies `/api` + `/sanctum` → `8000` (`vite.config.ts`); if master pages show "Tidak dapat terhubung ke server backend" the Laravel server is down.
- Wrapper: `./dev.sh` (root, **Git Bash/MSYS on Windows**, not PowerShell) starts both, checks ports 8000/8080, logs to `.dev/logs/`, kills on Ctrl+C. Starts plain `php artisan serve` (no queue/pail — `composer dev` is the full loop). Skip ngrok with `SKIP_TUNNEL=1`.
- Prod is same-origin: `VITE_API_URL` stays **unset** (fallback `/api` in `src/lib/api.ts`), `Frontend/vercel.json` rewrites `/api/*` + `/sanctum/*` → ngrok URL. `dev.sh` auto-injects the ngrok URL into `vercel.json`, saves to `.dev/logs/ngrok-url.txt`, copies to clipboard — URL rotates each restart so commit + redeploy Vercel each time. Do not set `VITE_API_URL` on Vercel. `Backend/config/cors.php` (`allowed_origins` from `FRONTEND_URL`, `supports_credentials: false`) only matters for rare direct cross-origin calls.

## Frontend

- Package manager: **bun** (`bun.lock` + `package-lock.json` must stay in sync). `bunfig.toml` has 24h `minimumReleaseAge` guard — new deps <24h fail until added to `minimumReleaseAgeExcludes` (confirm with user).
- Commands in `Frontend/`: `npm run dev` (regenerates `routeTree.gen.ts`), `npm run build` / `build:dev` / `preview`, `npm run lint` (`eslint .`, `@typescript-eslint/no-unused-vars` OFF), `npm run format`, `npm test` (`vitest run`), `npx tsc --noEmit` (no typecheck script).
- `vite.config.ts` must stay thin — `@lovable.dev/vite-tanstack-config` already injects tanstackStart, viteReact, tailwindcss, nitro, etc. Only manual addition is `server.proxy`.
- Routing: file-based `src/routes/`, only `__root.tsx` layout. `routeTree.gen.ts` is **auto-generated**, never edit. Most modules use generic `$section` routes; specific slugs dispatch to API pages: `master` → `kategori`/`sub-kategori`/`merk`/`satuan`/`gudang`/`rak`/`bin-location`/`supplier`/`customer`/`vendor`/`departemen`/`proyek`/`work-order`/`user`/`role`; `transaksi` → `masuk`/`keluar`/`transfer`/`retur-pembelian`/`retur-penjualan` (each has static list+form files). To add a menu item: register slug in module registry **and** `src/components/wms/nav.ts`.
- Data: most pages use deterministic dummy `src/lib/wms-data.ts` (seeded PRNG). API-backed: all master pages + `persediaan/stock|kartu-stock|mutasi|stock-minimum|nilai|adjustment` + `transaksi/masuk|keluar|transfer|retur-pembelian|retur-penjualan` + `pengadaan/receive-goods` (all hit `POST /api/persediaan/stock-documents` etc., need `Persediaan` Tulis). See `Frontend/AGENTS.md` for endpoints/hooks.
- Gotchas: TanStack Query `enabled: typeof window !== "undefined"` (SSR shell, hydrate client). `PER_PAGE=500` hard-coded. `master.barang.$id.tsx` static SSR title (intentional). Strict tsconfig (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) → `arr[i]!`. Path alias `@/*` → `src/*`. `DataTable` requires `mobileCard`. Reuse `src/components/wms/kit.tsx`, `formatIDR` helpers. Theming: 8 pastel `data-theme` via `kg-theme` + `src/styles.css` oklch only, no `tailwind.config.*`.

## Backend

- Stack: PHP 8.3, Laravel 13, **PostgreSQL 18** at `127.0.0.1:5432` (`postgres`/`postgres`). **Not on PATH** — use `C:/Program Files/PostgreSQL/18/bin/psql.exe` / `createdb.exe`. Dev DB `kelolagudang`, test DB `kelolagudang_test` (`phpunit.xml`). First-time: `CREATE DATABASE kelolagudang; CREATE DATABASE kelolagudang_test;`.
- Commands in `Backend/`: `composer dev` (serve+queue+pail+vite), `composer test` (= `php artisan test`, PHPUnit 12), `php artisan test --filter=Name` / `vendor/bin/phpunit tests/Feature/FooTest.php`, `vendor/bin/pint`, `php artisan migrate` (never `migrate:fresh` — see below).
- API: `routes/api.php` (`bootstrap/app.php` `withRouting(api:...)`). Auth = Sanctum **bearer-token** only (`POST /api/auth/login` throttle 5/min → `{data,access,token}`, `GET /api/auth/me`, `POST /api/auth/logout`); token in `localStorage` `kg-token` (`src/lib/api.ts`) as `Authorization: Bearer`. No `statefulApi()`, no cookies/CSRF. RBAC: `/api/master/*` → `role.access:Master Data`, `/api/persediaan/*` → `role.access:Persediaan`, `/api/pengadaan/*` → `role.access:Pengadaan` (+ approve/reject under plain `auth:sanctum`); level derived from verb (GET/HEAD=Baca, POST/PUT/PATCH=Tulis, DELETE=Kelola) via `EnsureRoleAccess`; `role_permissions` (`role`,`module`,`level`, unique `(role,module)`) seeded by `RolePermissionSeeder`.
- Response envelope: `{data}` / `{data,links,meta}`; validation in `FormRequests`; resources map `min_stock→min` etc. + raw FKs for form prefill.
- Stock ledger: `items.stock`/`reserved` denormalized; source of truth `item_stock` (PK `item_id,warehouse_id,bin_id`) + `stock_movements`/`stock_documents`+lines via `StockLedger`/`StockDocumentService`. See `Backend/AGENTS.md` for schema details.

### Never run `migrate:fresh` — SANGAT PENTING
`migrate:fresh` / `migrate:fresh --seed` / any DB-wiping command on dev DB `kelolagudang` is **FORBIDDEN** without explicit user instruction. It wipes users/master/stock/`role_permissions` and breaks login ("Kredensial tidak cocok"). Use new migration + `php artisan migrate`. If dev DB empty, restore with `php artisan db:seed` (non-idempotent, only on empty DB). `UserSeeder` requires `DEMO_PASSWORD` from `Backend/.env` (exception if empty; never commit literal passwords — see `Frontend/docs/akun-login.md` + `.env.example`). `composer setup` also fails on seeded DB.

## Git rules

- Never run `git add` / `commit` / `push` / history rewrite (rebase/merge/amend/force-push) without explicit user instruction. When asked, stage only relevant files — never `git add .` / `-A`.
- Before commit/push: review `git status` + `git diff` / `--cached` line-by-line; scan for secrets (`authtoken`, `api[_-]?key`, `secret`, `password`, `token`, `APP_KEY`, AWS creds, `BEGIN ... PRIVATE KEY`, embedded URL creds); reject `.env*`, `*.key`/`*.pem`/`*.p12`, `ngrok.yml`, `.dev/` artifacts, build output (`dist`, `.output`, `.nitro`, `public/build`), `node_modules`, IDE/OS files. Verify `.gitignore` covers them first. Keep `bun.lock` + `package-lock.json` in sync.
- If suspicious, stop and report — do not commit/push.

## Multi-session protocol

Multiple opencode sessions share one working tree / `main` / test DB / ports 8000+8080 — last-writer-wins.
1. Claim before editing: add `| <path> | <role> | claimed |` to `.dev/claims.md`; release to `done` when finished. Read it **before every edit**.
2. `git status` is live truth — uncommitted changes you didn't make mean another session owns that file.
3. Serialize edits to the same file; never edit a claimed path.
4. Only one session runs `./dev.sh` / `composer test` / `migrate` at a time (ports collide, `RefreshDatabase` wipes `kelolagudang_test`).
5. Small commits per task (only when user asks), short claim windows. On conflict, stop and report.
