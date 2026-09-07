# Catatan Linux Minimal — Run Kelola Gudang di Linux

## Stack & Prasyarat
- Backend: PHP 8.3 Laravel 13 + PostgreSQL 18 (127.0.0.1:5432 postgres/postgres), Vite via npm di Backend
- Frontend: Node 20 LTS + Bun 1.3 (bun.lock + package-lock.json sync), TanStack Start Vite proxy /api → 8000
- 2 Server: `composer dev` 8000 (serve+queue+pail+vite) + `npm run dev` 8080 (Vite)

## Tools Minimal (Debian/Ubuntu apt)
```bash
# Sistem
sudo apt update && sudo apt install -y curl git unzip build-essential

# PHP 8.3 via ondrej
sudo add-apt-repository -y ppa:ondrej/php && sudo apt update
sudo apt install -y php8.3 php8.3-cli php8.3-fpm php8.3-mbstring php8.3-xml php8.3-curl php8.3-zip php8.3-pdo php8.3-pgsql php8.3-bcmath php8.3-tokenizer php8.3-ctype php8.3-fileinfo

# Composer
curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer

# Node 20 + Bun
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs
curl -fsSL https://bun.sh/install | bash  # ~/.bun/bin/bun
export PATH="$HOME/.bun/bin:$PATH"

# PostgreSQL 18 (atau 16 bila 18 belum ada di repo)
# Ubuntu 24.04: apt.postgresql.org
sudo apt install -y postgresql postgresql-contrib
sudo service postgresql start
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
# Edit .env: DEMO_PASSWORD=IndomieGoreng, DB_PASSWORD=postgres, FRONTEND_URL=http://localhost:8080
php artisan migrate --force
php artisan db:seed  # jangan migrate:fresh bila ada data

# Frontend
cd ../Frontend
bun install  # + npm ci bila lock desync
bunx tsc --noEmit  # harus 0
npm test  # vitest 43/43
```

## Playwright Opsional (Screenshot read-only)
```bash
# Frontend
bun add -d @playwright/test
bunx playwright install --with-deps chromium
DEMO_PASSWORD=IndomieGoreng bunx playwright test e2e/screenshots --project=desktop --project=mobile
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
node -v # 20, bun --version
psql --version && pg_isready -h 127.0.0.1
curl http://127.0.0.1:8000/up  # 200
curl http://localhost:8080    # 200
```

Tanpa ngrok/vercel: `VITE_API_URL` harus unset (fallback /api, vite proxy). Tanpa docker/redis/wrangler.
