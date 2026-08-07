# Kelola Gudang Pro

Warehouse Management System (WMS) monorepo. Two sibling sub-projects with **no root manifest**. Git repo lives at the root (branch `main`, remote `origin` → `https://github.com/BangkitHaqiAliaffuan/Kelola-Gudang---Hexa.git`) — commit from the root, not inside a sub-project. The Frontend is Lovable-connected, so never force-push or rewrite published history. Each sub-project has its own detailed AGENTS.md — read the relevant one before touching its code.

- `Frontend/` — the active product: TanStack Start + React 19 UI demo (Indonesian UI). `Frontend/AGENTS.md` is authoritative and detailed — commands, routing, tooling gotchas, and data conventions live there.
- `Backend/` — Laravel 13 API powering the master data module (Kategori, Sub Kategori, Merk, Satuan, Gudang, Rak, Bin, Supplier, Customer, Vendor, Barang — API-backed since 2026). `Backend/AGENTS.md` holds the API conventions, schema notes, and env setup.

## Git rules

- **Never run `git add`, `git commit`, `git push`, or rewrite history (rebase/merge/amend/force-push) without an explicit user instruction.** When asked to commit, stage only the files relevant to the task — never `git add .` / `git add -A`.
- **Before any commit/push, do a deep pre-commit check** and show the user what would be committed:
  - Review `git status`, `git diff`, and `git diff --cached` line by line.
  - Scan staged and new files for secrets: `authtoken`, `api[_-]?key`, `secret`, `password`, `token`, `APP_KEY`, AWS/cloud credentials, `BEGIN (RSA|OPENSSH|EC|PRIVATE) KEY`, URLs with embedded credentials. Never commit `.env`, `.env.local`, `*.key`, `*.pem`, `*.p12`, or `ngrok.yml`.
  - Reject unnecessary/volatile files: logs, `.dev/` artifacts, build output (`dist`, `.output`, `.nitro`, `public/build`), `node_modules`, IDE/OS files.
  - Verify `.gitignore` covers everything above; add rules first if not.
  - Keep `bun.lock` and `package-lock.json` in sync — they change together.
- If anything suspicious is found, **stop and report to the user** — do not commit/push until resolved.

## Running the app

Dev loop needs **TWO servers**:

- Laravel API: `composer dev` in `Backend/` → `http://127.0.0.1:8000` (also runs queue:listen + pail + npm run dev).
- Frontend: `npm run dev` in `Frontend/` → `http://localhost:8080` (default injected by `@lovable.dev/vite-tanstack-config` — not 8081). Vite proxies `/api` → `http://127.0.0.1:8000` (`vite.config.ts`). If master pages show "Tidak dapat terhubung ke server backend", the Laravel server isn't running.

Convenience wrapper: `./dev.sh` at the root starts both servers (logs to `.dev/logs/`), verifies ports 8000/8080 are free first, and kills both on Ctrl+C. Prefer this over running the two loops separately. Note `dev.sh` is a bash script — on Windows run it from **Git Bash / MSYS**, not PowerShell. It starts a plain `php artisan serve` (no queue:listen/pail); `composer dev` is the full-loop alternative.

`dev.sh` also starts an **ngrok tunnel** to the backend (skip with `SKIP_TUNNEL=1`) so the Vercel-deployed frontend can reach the local API from production. It prints `VITE_API_URL=<ngrok-url>/api` (also saved to `.dev/logs/ngrok-url.txt` and copied to clipboard). To use it: set that value in the Vercel project's Environment Variables and redeploy — the URL changes each ngrok restart. Backend CORS for this is enabled via `Backend/config/cors.php`.

## Frontend

UI-only WMS demo — deterministic dummy data from `src/lib/wms-data.ts` (seeded PRNG), except the API-backed master pages. Managed by **bun** (both `bun.lock` and `package-lock.json` must stay in sync). No typecheck script — use `npx tsc --noEmit`. The real product requirements are in `Frontend/README.md`. Full details in `Frontend/AGENTS.md`.

## Backend (Laravel 13)

PostgreSQL 18 at `127.0.0.1:5432` (user `postgres`, password `postgres`), **NOT on PATH** — use full path `C:/Program Files/PostgreSQL/18/bin/psql.exe` (`createdb.exe`). Dev DB `kelolagudang`, test DB `kelolagudang_test` (per `phpunit.xml`). `items.stock`/`reserved` are denormalized today and will move to an `ITEM_STOCK` table (composite PK `item_id, warehouse_id, bin_id`) with the Persediaan module. Master data includes `racks`/`bins` (Rak / Bin Location) and `suppliers`/`customers`/`vendors` (Supplier / Customer / Vendor); `items.default_rack_id`/`default_bin_id`/`preferred_supplier_id` are FKs (`nullOnDelete`). Full commands, API conventions, and schema notes in `Backend/AGENTS.md`.

## Multi-session protocol

Multiple opencode sessions can run in this same directory at once (e.g. one on features, one on fixes). They share ONE working tree, ONE `main` branch, ONE test DB (`kelolagudang_test`), and ONE dev port pair (8000/8080). **Concurrent edits to the same file silently overwrite each other (last-writer-wins).** Follow this protocol to avoid corruption — it is cooperative, not enforced:

1. **Claim before editing.** Edit `.dev/claims.md` (add `| <path> | <role> | claimed |`) before touching any file; release (`done`) when finished. Read it **before every edit** — a file claimed by another session is off-limits until released.
2. **`git status` is the live truth.** Before starting work, run `git status` / `git diff --name-only`. Any file with uncommitted changes not made by you is considered owned by the other session — do not touch it.
3. **Serialize overlapping files.** If two tasks need the same file, work sequentially, not in parallel. Never edit a file the other session is mid-edit on.
4. **One session runs the runtime at a time.** Only one session runs `./dev.sh` / `composer test` / `php artisan migrate` at a time — ports 8000/8080 collide, and `RefreshDatabase` in tests wipes the shared `kelolagudang_test` DB, so two concurrent test runs corrupt each other's data.
5. **Small commits per task.** Commit at task boundaries (only when the user asks) so claimed-file windows stay short. Stage only the files relevant to your task.
6. **If you detect a conflict or stale file**, stop and report to the user — do not overwrite the other session's work.
7. **The other session decides file ownership.** If unsure whether a file is yours to edit, ask the user (who coordinates between sessions).
