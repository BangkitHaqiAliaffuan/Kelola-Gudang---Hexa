<?php

namespace App\Console\Commands;

use App\Services\Ai\WmsSchema;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Siapkan role PostgreSQL read-only `ai_reader` untuk text-to-SQL AI (F8.5, L4).
 *
 * Pertahanan DB-level yang sebenarnya: validator SQL bisa ditembus pola baru,
 * tetapi role tanpa hak tulis + transaksi READ ONLY menahan secara fisik.
 * Jalankan sebagai user PG superuser/pemilik DB, lalu isi AI_DB_USERNAME
 * (disarankan juga AI_ENFORCE_READER=true agar analitik menolak jalan tanpa
 * role ini). Idempoten — aman diulang. `--dry-run` hanya menampilkan SQL.
 */
class AiSetupReaderCommand extends Command
{
    protected $signature = 'ai:setup-reader
        {--role=ai_reader : Nama role read-only yang dibuat}
        {--dry-run : Tampilkan SQL tanpa mengeksekusi}';

    protected $description = 'Buat role PostgreSQL SELECT-only untuk analitik AI (ai_reader)';

    public function handle(): int
    {
        if (DB::getDriverName() !== 'pgsql') {
            $this->error('Hanya PostgreSQL yang didukung (koneksi DB saat ini: '.DB::getDriverName().').');

            return self::FAILURE;
        }

        $role = (string) $this->option('role');
        if (! preg_match('/^[a-z_][a-z0-9_]*$/', $role)) {
            $this->error('Nama role tidak valid (huruf kecil/angka/underscore).');

            return self::FAILURE;
        }

        $database = DB::getDatabaseName();
        $appUser = (string) config('database.connections.'.config('database.default').'.username', '');
        $tables = implode(', ', array_map(fn ($t) => '"public"."'.$t.'"', array_keys(WmsSchema::tables())));

        $statements = [
            "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '{$role}') THEN CREATE ROLE \"{$role}\" NOLOGIN; END IF; END \$\$;",
            "GRANT CONNECT ON DATABASE \"{$database}\" TO \"{$role}\";",
            'GRANT USAGE ON SCHEMA public TO "'.$role.'";',
            "GRANT SELECT ON {$tables} TO \"{$role}\";",
        ];
        if ($appUser !== '') {
            $statements[] = "ALTER DEFAULT PRIVILEGES FOR ROLE \"{$appUser}\" IN SCHEMA public GRANT SELECT ON TABLES TO \"{$role}\";";
        }

        if ((bool) $this->option('dry-run')) {
            foreach ($statements as $sql) {
                $this->line($sql);
            }

            return self::SUCCESS;
        }

        foreach ($statements as $sql) {
            DB::statement($sql);
        }

        $this->info("Role \"{$role}\" siap (SELECT-only atas ".count(WmsSchema::tables()).' tabel).');
        $this->line('Langkah lanjut: set AI_DB_USERNAME='.$role.' (+ password bila ada) dan AI_ENFORCE_READER=true di .env produksi.');

        return self::SUCCESS;
    }
}
