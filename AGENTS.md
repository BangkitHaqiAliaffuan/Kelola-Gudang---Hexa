# Kelola Gudang Pro

WMS monorepo — no root manifest (stray root `package-lock.json`, ignore it). Git lives at root (`main`); commit from root, never inside `Frontend/`/`Backend/`. Lovable-connected → never force-push / rebase / amend pushed history. Two siblings: `Frontend/` (TanStack Start + React 19, Indonesian UI) and `Backend/` (Laravel 13 API). Read `Frontend/AGENTS.md` / `Backend/AGENTS.md` before touching that side — they are authoritative, this file is only the cross-cutting surface. Linux setup: `Frontend/docs/catatan-linux-min.md`.

## Running (two servers required)

- Backend `composer dev` in `Backend/` → `http://127.0.0.1:8000` (also spins `queue:listen` + `pail` + Backend's own vite — NOT the Frontend; for API-only work plain `php artisan serve` is enough). Frontend `npm run dev` in `Frontend/` → `http://localhost:8080` (8080 injected by `@lovable.dev/vite-tanstack-config`). Vite proxies `/api` + `/sanctum` → `8000` (`Frontend/vite.config.ts`); "Tidak dapat terhubung ke server backend" means Laravel is down.
- `./dev.sh` is a thin wrapper: plain `php artisan serve` + `npm run dev` (no queue/pail — `composer dev` is the full loop). Logs to `.dev/logs/`, kills on Ctrl+C, aborts if 8000/8080 already busy. Git Bash/MSYS on Windows, not PowerShell. `SKIP_TUNNEL=1 ./dev.sh` skips ngrok.
- Prod is same-origin: `VITE_API_URL` stays **unset** (fallback `/api` in `Frontend/src/lib/api.ts`). `Frontend/vercel.json` rewrites `/api/*` + `/sanctum/*` → ngrok URL; `dev.sh` auto-replaces the destination each restart → commit + redeploy Vercel after. Never hand-edit the destination, never set `VITE_API_URL` on Vercel. Gotcha (verified): `dev.sh` `sed` only matches the literal placeholder `https://NGROK-URL.ngrok-free.app` — once a real ngrok URL is committed (as now), restarts silently stop updating it; restore the placeholder (or hand-edit) before relying on auto-replace. `Backend/config/cors.php` (`FRONTEND_URL`, `supports_credentials:false`) only matters for rare direct cross-origin calls.
- DB: **PostgreSQL 16** at `127.0.0.1:5432` (`postgres`/`postgres`). Dev `kelolagudang`, test `kelolagudang_test` (`Backend/phpunit.xml`). First-time: `CREATE DATABASE kelolagudang; CREATE DATABASE kelolagudang_test;`.

## Cross-cutting contracts (details in sub-AGENTS.md)

- Auth Sanctum **bearer-token only**: `POST /api/auth/login` (throttle 5/min → `{data,access,token}`), token in `localStorage` `kg-token` as `Authorization: Bearer`. No `statefulApi()`, no cookies/CSRF. Tokens expire after 24h (`Backend/config/sanctum.php` `expiration => 1440`) — a 401 on a previously working token means re-login, not a bug. Always send `ngrok-skip-browser-warning: true` (already in `src/lib/api.ts`).
- RBAC via `role.access` (`EnsureRoleAccess`), level from verb (GET/HEAD=Baca, POST/PUT/PATCH=Tulis, DELETE=Kelola); missing `(role,module)` row = no access. Module map: `/api/master/*`→`Master Data`, `/api/persediaan/*`→`Persediaan`, `/api/pengadaan/*`→`Pengadaan`, `/api/laporan/*`→`Laporan`, `/api/system/*`→`System` (see `Backend/routes/api.php` + `RolePermissionSeeder`). Full `RolePermission::MODULES` list (9: +`Transaksi`, `Stock Opname`, `Approval Pengadaan`, `Audit Trails`) is UX-gating only beyond those five.
- **Auth-only actions (plain `auth:sanctum`, no module gate):** persediaan `approve`/`reject`/`approve-review`/`reject-review` (assignee-only); persediaan `force-unlock` (Persediaan `Kelola` or Auditor, controller-checked); pengadaan `proc-docs/{id}/approve`/`reject` (assigned approver only). `reassign` lives in the gated group (`api.php:95`) and needs Pengadaan `Kelola` (controller-checked). Everything else under `/api/persediaan/*` and `/api/pengadaan/*` goes through the module gate — incl. `submit-approval`/`submit-review`/`lock`/`heartbeat`/`unlock` (need Persediaan Tulis) and `proc-docs/submit`/`cancel` (need Pengadaan Tulis).
- Envelope `{data}` / `{data,links,meta}`; validation in FormRequests; resources expose raw FKs + string relation names for form prefill. Truth for API surface is `Backend/routes/api.php` — incl. extras beyond `apiResource`: `items/lookup`, `items/cost-drift`, `items/sync-cost`, `items/bulk-*`, `stock-documents/summary`, `GET /laporan/mutasi|keluar-analytics|transaksi-analytics|fast-moving`, `GET|PUT /system/settings`, `GET /system/audit-logs` (in `routes/audit.php`, loaded via `AppServiceProvider`, gated `Audit Trails`). (README's `per_page=10000` is stale — hooks use `fetchAll()` with `per_page=100`, aggregates `max:500`.)
- Stock ledger: `items.stock`/`reserved` are denormalized; truth is `item_stock` + `stock_movements` via `StockLedger`/`StockDocumentService`. Opname posts 0 movements — finishing it creates an `ADJ` **Draft** (post later from `persediaan/adjustment`). Transfer writes an OUT+IN mirror pair (`pair_id`).
- TanStack Query needs `enabled: typeof window !== "undefined"` (SSR shell). No server pagination — hooks fetch all via `fetchAll()` (loop `per_page=100`; backend `max:100`, agregat `max:500`) and paginate client-side.
- Penomoran (`CodeGenerator`) via tabel `document_counters` O(1) + self-heal ke legacy-max bila kandidat dipakai/didahului nomor manual — jangan kembalikan `pluck`+advisory-lock; gap kecil diterima (lihat `roadmap-final-skalabilitas-wms.md` K1).

## Verify (per side, run in that side's dir)

- Frontend (`bun` manages deps, but run via npm): `npm run lint`, `npx tsc --noEmit` (no typecheck script), `npm test` (`vitest run`). Bun `bunfig.toml` has a 24h `minimumReleaseAge` guard — confirm with user before adding exclusions. Keep `bun.lock` + `package-lock.json` in sync.
- Backend: `composer test` (= `config:clear` + `php artisan test` on `kelolagudang_test`; single test via `php artisan test --filter=Name`), `vendor/bin/pint`. No CI — run these locally.

### Never run `migrate:fresh` — SANGAT PENTING
`migrate:fresh` (or any DB-wiping command) on dev DB `kelolagudang` is **FORBIDDEN** without explicit user instruction — wipes users/master/stock/`role_permissions`, breaks login ("Kredensial tidak cocok"). Use a new migration + `php artisan migrate`. If dev DB is empty, `php artisan db:seed` (every seeder has an `exists()` guard — re-run is a safe no-op). `UserSeeder` requires `DEMO_PASSWORD` in `Backend/.env` (throws if empty; never commit literal passwords — see `Frontend/docs/akun-login.md` + `Backend/.env.example`).

## Dokumentasi

- `Frontend/docs/`: manual/test docs always `.txt` (`tes-*`, `retest-*`, `testing-*`, `ringkasan-*`); specs/ERD/login stay `.md` (`erd-*`, `akun-login.md`, `catatan-linux-min.md`).
- Test docs are browser-manual guides in plain Bahasa Indonesia (`http://localhost:8080` + `http://127.0.0.1:8000`): `Buka menu → Klik → Isi → Simpan → Cek toast/tabel` + `[LULUS/GAGAL]` checklist. **DILARANG** `psql`/`SELECT`/`query`/`migrate:fresh --seed`/`db:seed`/`seeder`/`curl`/`GET /api` inside them — UI verification only. Each `*.txt` needs: `Prasyarat (2 server + akun dari akun-login.md)` → `Langkah klik` → `Expected (toast/status/stok)` → `[LULUS/GAGAL]` → `Tanggal/Penguji/Catatan` footer.
- Don't create new test docs or `stage` them unless the user explicitly asks (archive of a bug finding), then `git add <explicit-path>` (note: `Frontend/docs/*.txt` is gitignored, so staging fails silently unless forced).
- Saat user minta "ringkaskan" sebuah/sejumlah commit (laporan OJT): baca `git log --stat` pada rentang tanggal, abaikan merge + `Change NGROK URL`; keluarkan **Bab Materi / Tugas** (area modul) + **Detail Aktivitas** Bahasa Indonesia past-tense ala spreadsheet, **maksimal 3 kalimat singkat** — potong kegiatan yang tidak penting bila tidak cukup. Tanpa URL/teknis dalam (URL masuk kolom Laporan Harian, bukan Detail Aktivitas); perincian per-commit hanya bila diminta.

## Git rules

- Never `git add`/`commit`/`push`/rewrite history (rebase/merge/amend/force-push) without explicit user instruction. When asked, `git add <explicit-path>` only for your task's files — never `git add .`/`-A`/`commit -a`, never sweep in other sessions' changes even with `commit` permission (unless user writes `commit all` or names the path).
- **`implementasikan`/`lanjutkan`/`fix`/`crosscheck`/`plan` ≠ izin commit/push** — those mean edit + verify; stop at `git status`/`git diff` otherwise.
- Before commit: `git status` + line-by-line `git diff`/`--cached`; if foreign changes are staged, `git restore --staged <path>` and report. Scan for secrets (`authtoken`, `api[_-]?key`, `secret`, `password`, `token`, `APP_KEY`, AWS creds, `BEGIN .* PRIVATE KEY`, URL creds). Reject `.env*`, `*.key`/`*.pem`/`*.p12`, `ngrok.yml`, `.dev/` artifacts, build output (`dist`, `.output`, `.nitro`, `public/build`), `node_modules`. Keep `bun.lock`+`package-lock.json` in sync.

## Multi-session protocol

Multiple opencode sessions share one working tree / `main` / test DB / ports 8000+8080 — last-writer-wins.
1. Claim before editing: read `.dev/claims.md` (gitignored, create on demand) **before every edit**, add `| <path> | <role> | claimed |`; release to `done` when finished.
2. `git status` is live truth — uncommitted changes you didn't make belong to another session.
3. Serialize edits to the same file; never touch a `claimed` path.
4. Only one session at a time runs servers (`./dev.sh` / `composer dev` / `php artisan serve` / `npm run dev`), `composer test`, or `migrate` — `composer dev` and `dev.sh` both bind port 8000, and `RefreshDatabase` wipes `kelolagudang_test`.
5. Small commits per task (only when asked), short claim windows. On conflict, stop and report.
