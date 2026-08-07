<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# KelolaGudang Pro

Warehouse Management System front-end demo (**KelolaGudang**, Indonesian UI). Most data is deterministic dummy data generated in `src/lib/wms-data.ts` (seeded PRNG). **Exception: the master-data pages (Kategori, Sub Kategori, Merk, Satuan, Gudang, Rak, Bin Location, Supplier, Customer, Vendor, Barang) are backed by the Laravel API** (`Backend/`) — no dummy fallback. The remaining modules (transaksi, persediaan, opname, pengadaan, laporan, system) are still UI-only dummy. Do not add server/business logic unless asked; the "API reference" pages under `/system/developer` are UI placeholders.

## Stack

TanStack Start (SSR) + React 19 + TanStack Router file-based routing + Vite + Tailwind CSS v4 + shadcn/ui (Radix) components + recharts + TanStack Query + react-hook-form + zod. Content, statuses, and labels are in **Bahasa Indonesia**.

## Backend API integration (master data)

- Master data (Kategori, Sub Kategori, Merk, Satuan, Gudang, Rak, Bin Location, Supplier, Customer, Vendor, Barang) comes from the Laravel API. Types mirror the API resources in `src/lib/master-types.ts`; API client in `src/lib/api.ts` (`api.get/post/put/delete`, `Paginated<T>`, `ApiError`, `fieldError`). `API_BASE` is `VITE_API_URL` (build-time env) falling back to `/api` — the deployed Vercel build needs `VITE_API_URL` set to `<backend>/api` (e.g. the ngrok URL printed by `dev.sh`) or it calls the Vercel origin's `/api` and fails.
- Hooks in `src/hooks/use-master.ts` (TanStack Query). They fetch everything (`per_page=500`) and let the UI paginate/filter client-side. **Queries are `enabled`-gated on `typeof window !== "undefined"`** so SSR doesn't fetch a relative `/api` URL — pages render the shell server-side and data hydrates client-side.
- `PER_PAGE=500` is a hardcoded scale assumption (≤300 items today). Revisit when item count can exceed the page size — the UI has no server pagination yet.
- `master.barang.$id.tsx` sets a **static SSR `<head>` title** — the item name comes from a client-side query and can't be known during server render. Accepted tradeoff for API-backed detail pages.
- Zod validation in `src/lib/schemas.ts` mirrors backend FormRequests; field errors map back onto the form via `form.setError(fieldError(...))`.
- Shared CRUD scaffolding: `src/components/wms/master-crud.tsx` (`MasterCrudPage` table + `CrudFormDialog`, with optional `filters` and `onExport` props — the Supplier/Customer/Vendor pages use these for dropdown filters and real CSV export) and `src/components/wms/master-forms.tsx` (per-entity dialogs, incl. `RackFormDialog`/`BinFormDialog`, the `SupplierFormDialog`/`CustomerFormDialog`/`VendorFormDialog`, and the rak/bin/supplier selects on the Item form). `src/components/wms/master-crud-pages.tsx` has the Kategori/Sub Kategori/Merk/Satuan/Gudang/Rak/Bin/Supplier/Customer/Vendor pages. CSV helpers live in `src/lib/csv.ts` (`toCsv`/`downloadCsv`, UTF-8 BOM for Excel).
- `master.barang.$id.tsx` shows real API data, but its **Kartu Stock / Riwayat tabs are placeholders** fed by dummy `stockCard()` until the Persediaan module ships ITEM_STOCK.

## Commands

```sh
npm run dev        # dev server (regenerates routeTree.gen.ts on change)
npm run build      # production build
npm run build:dev  # build in development mode
npm run preview
npm run lint       # eslint .  (no typecheck; @typescript-eslint/no-unused-vars is OFF)
npm run format     # prettier --write .
```

**Dev loop needs TWO servers** now: the Laravel API (`composer dev` in `Backend/` → `http://127.0.0.1:8000`) plus this frontend (`npm run dev` → `http://localhost:8080` — the 8080 default is injected by `@lovable.dev/vite-tanstack-config`, not set here). Vite proxies `/api` → `http://127.0.0.1:8000` (defined in `vite.config.ts`). If the master pages show the "Tidak dapat terhubung ke server backend" error, the Laravel server isn't running.

- No test suite, no CI, no typecheck script. Use `npx tsc --noEmit` to type-check.
- Package manager: **bun** (`bun.lock`, `bunfig.toml`). `package-lock.json` also exists — keep both lockfiles in sync if changing deps.
- `bunfig.toml` has a 24h `minimumReleaseAge` guard on installs. New deps published <24h ago fail until added to `minimumReleaseAgeExcludes` — confirm with the user before adding to that list.

## Routing

- File-based routing in `src/routes/`. Only root layout is `src/routes/__root.tsx` (renders `<Outlet />` — removing it breaks all children). Never create `src/pages/` or `app/layout.tsx` (Next.js/Remix conventions).
- `src/routes/routeTree.gen.ts` is **auto-generated** — never edit by hand.
- Most modules use one generic route with a `$section` param instead of a file per page:
  - `/master/$section` → `GenericMasterPage`, data in `masterDatasets` (`src/components/wms/generic-master.tsx`) — **except `kategori`/`sub-kategori`/`merk`/`satuan`/`gudang`/`rak`/`bin-location`/`supplier`/`customer`/`vendor`, which dispatch to the API-driven pages** (`KategoriPage`/`SubKategoriPage`/`MerkPage`/`SatuanPage`/`GudangPage`/`RakPage`/`BinPage`/`SupplierPage`/`CustomerPage`/`VendorPage`) in `src/components/wms/master-crud-pages.tsx`
  - `/transaksi/$section` → `TransactionPage`, config in `trxSections` (`src/lib/trx-sections.ts`)
  - `/transaksi/entri/$section` → `TransactionFormPage` (same `trxSections` registry)
  - `/persediaan/$section`, `/opname/$section`, `/pengadaan/$section`, `/system/$section`, `/laporan/$report` → inline slug→config maps in each route file
- **To add a menu item**: register the slug in the module's registry AND add it to `navGroups` in `src/components/wms/nav.ts`. Only create a new route file for a genuinely custom page (e.g. `master/barang`, `persediaan/kartu-stock`).

## Tooling gotchas

- `vite.config.ts` must stay thin. `@lovable.dev/vite-tanstack-config` already injects tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro, devtools, etc. — adding them manually breaks the build with duplicate plugins. `server: { entry: "server" }` points SSR at `src/server.ts` (error wrapper); `src/start.ts` re-adds CSRF middleware explicitly. The only manual addition is `vite.server.proxy: { "/api": "http://127.0.0.1:8000" }`.
- Path alias `@/*` → `src/*` (tsconfig paths + vite).
- tsconfig is strict with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`. Array/record indexing needs non-null assertions (`arr[i]!`); `!` is idiomatic here.

## UI / data conventions

- All dummy data and formatting helpers live in `src/lib/wms-data.ts`: `items` (~300), `transactions` (~2000), `suppliers`, `customers`, `warehouses`, `purchaseOrders`, `auditLogs`, etc. Use `formatIDR` / `formatNumber` / `formatDate` (id-ID locale) instead of ad-hoc formatting.
- Reuse `src/components/wms/kit.tsx` (`PageHeader`, `Panel`, `Pill`, `StatCard`, `FilterSelect`, `EmptyState`, `TableSkeleton`, `ALL` const) and `DataTable` (`src/components/wms/data-table.tsx`). **Every DataTable usage requires a `mobileCard` render prop** — tables collapse to cards on mobile. `DataTable`'s row constraint is `{ id: string | number }` (dummy data uses string ids, API data uses numeric ids).
- Buttons/inputs use `rounded-xl`; semantic tones are `success` / `warning` / `info` / `danger` / `brand` / `neutral`. Don't invent new color tokens.
- Theming: 8 pastel themes via `data-theme` attribute + localStorage key `kg-theme` (`src/components/wms/theme.tsx`). Colors are defined in `src/styles.css` (Tailwind v4 `@theme inline` + oklch only — new colors MUST be oklch). No `tailwind.config.*` file; CSS is the source of truth.
- Prettier: 100 print width, semicolons, double quotes, trailing commas. ESLint disallows importing Next.js's `server-only`; use `*.server.ts` naming instead.
