# Kelola Gudang Pro

Warehouse Management System (WMS) monorepo. Two sibling sub-projects with **no root manifest**. Git repo lives at the root (branch `main`, remote `origin` → `https://github.com/BangkitHaqiAliaffuan/Kelola-Gudang---Hexa.git`) — commit from the root, not inside a sub-project. The Frontend is Lovable-connected, so never force-push or rewrite published history. Each sub-project has its own detailed AGENTS.md — read the relevant one before touching its code.

- `Frontend/` — the active product: TanStack Start + React 19 UI demo (Indonesian UI). `Frontend/AGENTS.md` is authoritative and detailed — commands, routing, tooling gotchas, and data conventions live there.
- `Backend/` — Laravel 13 API powering the master data module (Kategori, Sub Kategori, Merk, Barang — API-backed since 2026). `Backend/AGENTS.md` holds the API conventions, schema notes, and env setup.

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

Convenience wrapper: `./dev.sh` at the root starts both servers (logs to `.dev/logs/`), verifies ports 8000/8080 are free first, and kills both on Ctrl+C. Prefer this over running the two loops separately.

`dev.sh` also starts an **ngrok tunnel** to the backend (skip with `SKIP_TUNNEL=1`) so the Vercel-deployed frontend can reach the local API from production. It prints `VITE_API_URL=<ngrok-url>/api` (also saved to `.dev/logs/ngrok-url.txt` and copied to clipboard). To use it: set that value in the Vercel project's Environment Variables and redeploy — the URL changes each ngrok restart. Backend CORS for this is enabled via `Backend/config/cors.php`.

## Frontend

UI-only WMS demo — deterministic dummy data from `src/lib/wms-data.ts` (seeded PRNG), except the API-backed master pages. Managed by **bun** (both `bun.lock` and `package-lock.json` must stay in sync). No typecheck script — use `npx tsc --noEmit`. The real product requirements are in `Frontend/README.md`. Full details in `Frontend/AGENTS.md`.

## Backend (Laravel 13)

PostgreSQL 18 at `127.0.0.1:5432` (user `postgres`, password `postgres`), **NOT on PATH** — use full path `C:/Program Files/PostgreSQL/18/bin/psql.exe` (`createdb.exe`). Dev DB `kelolagudang`, test DB `kelolagudang_test` (per `phpunit.xml`). `items.stock`/`reserved` are denormalized today and will move to an `ITEM_STOCK` table (composite PK `item_id, warehouse_id, bin_id`) with the Persediaan module. Full commands, API conventions, and schema notes in `Backend/AGENTS.md`.
