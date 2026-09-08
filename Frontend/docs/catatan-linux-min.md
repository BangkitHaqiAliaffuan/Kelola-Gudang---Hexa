# Catatan Linux Minimal — Run Kelola Gudang di Linux

## Stack & Prasyarat
- Backend: PHP 8.3 Laravel 13 + PostgreSQL 16 (127.0.0.1:5432 postgres/postgres), Vite via npm di Backend
- Frontend: Node ≥20.19 LTS + Bun 1.x (bun.lock + package-lock.json sync), TanStack Start Vite proxy /api → 8000
- 2 Server: `composer dev` 8000 (serve+queue+pail+vite) + `npm run dev` 8080 (Vite)

> Versi PG: pakai **16** (default `apt` Ubuntu 24.04 / Mint 22.x, sama dengan root `AGENTS.md`).
> PG 18 hanya bila perlu, via repo `apt.postgresql.org` — tidak dibutuhkan proyek ini.
> Migrasi repo tidak memakai fitur PG spesifik versi (sudah di-crosscheck), jadi 16 ↔ 16 dijamin kompatibel.

## Tools Minimal (Debian/Ubuntu apt)
```bash
# Sistem
sudo apt update && sudo apt install -y curl git unzip build-essential software-properties-common

# PHP 8.3 via ondrej (fpm tidak perlu — artisan serve pakai CLI server)
sudo add-apt-repository -y ppa:ondrej/php && sudo apt update
sudo apt install -y php8.3 php8.3-cli php8.3-mbstring php8.3-xml php8.3-curl php8.3-zip php8.3-pdo php8.3-pgsql php8.3-bcmath php8.3-tokenizer php8.3-ctype php8.3-fileinfo

# Composer
curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer

# Node ≥20.19 + Bun (Node 22/26 juga OK — repo tidak mem-pin versi)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs
curl -fsSL https://bun.sh/install | bash  # ~/.bun/bin/bun
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc

# PostgreSQL 16 (default apt Noble — JANGAN tambah pgdg kecuali butuh PG 18)
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
sudo -u postgres psql -c "CREATE DATABASE kelolagudang;"
sudo -u postgres psql -c "CREATE DATABASE kelolagudang_test;"
```

## Setup Env
```bash
# Backend
cd Backend
composer install
cp .env.example .env
php artisan key:generate
# Edit .env: DEMO_PASSWORD=<isi-sendiri> (JANGAN commit nilai ini),
# DB_PASSWORD=postgres, FRONTEND_URL=http://localhost:8080
php artisan migrate --force
php artisan db:seed  # jangan migrate:fresh bila ada data

# Frontend
cd ../Frontend
bun install  # + npm ci bila lock desync
bunx tsc --noEmit  # harus 0 error
npm test  # vitest, semua harus lulus
```

## Playwright Opsional (Screenshot read-only)
```bash
# Frontend (@playwright/test sudah di devDependencies — jangan bun add lagi)
bunx playwright install --with-deps chromium  # butuh sudo untuk dep sistem
DEMO_PASSWORD=<sama-dengan-Backend/.env> bunx playwright test e2e/screenshots --project=desktop --project=mobile
# Hasil: test-results/screenshots/{desktop,mobile}/*.png (read-only, tidak POST)
```

## Run 2 Server
```bash
# Terminal 1: Backend 8000
cd Backend && composer dev
# atau SKIP ngrok
SKIP_TUNNEL=1 ./dev.sh  # root, Git Bash/MSYS di Windows, bash native di Linux

# Terminal 2: Frontend 8080
cd Frontend && npm run dev  # http://localhost:8080 (Vite proxy /api → 8000)
```

## Verifikasi
```bash
php -v  # 8.3
node -v # ≥20.19, bun --version
psql --version && pg_isready -h 127.0.0.1
curl http://127.0.0.1:8000/up  # 200
curl http://localhost:8080    # 200
```

Tanpa ngrok/vercel: `VITE_API_URL` harus unset (fallback /api, vite proxy). Tanpa docker/redis/wrangler.
