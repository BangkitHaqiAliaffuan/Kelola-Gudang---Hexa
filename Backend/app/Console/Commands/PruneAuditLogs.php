<?php

namespace App\Console\Commands;

use App\Models\AuditLog;
use Illuminate\Console\Command;

class PruneAuditLogs extends Command
{
    protected $signature = 'audit:prune {--days=180 : Hapus jejak lebih tua dari N hari} {--dry-run : Hitung saja tanpa menghapus}';

    protected $description = 'Hapus jejak audit (audit_logs) lebih tua dari N hari';

    public function handle(): int
    {
        $days = max(1, (int) $this->option('days'));
        $cutoff = now()->subDays($days);

        $query = AuditLog::query()->where('occurred_at', '<', $cutoff);

        if ($this->option('dry-run')) {
            $this->info("{$query->count()} baris jejak lebih tua dari {$days} hari (dry-run, tidak dihapus).");

            return self::SUCCESS;
        }

        $deleted = $query->delete();
        $this->info("Menghapus {$deleted} baris jejak lebih tua dari {$days} hari.");

        return self::SUCCESS;
    }
}
