<?php

namespace App\Console\Commands;

use App\Models\AuditLog;
use App\Models\StockDocument;
use App\Services\AuditLogger;
use Illuminate\Console\Command;

class BackfillAuditModules extends Command
{
    protected $signature = 'audit:backfill-modules {--apply : Tulis perubahan ke database}';

    protected $description = 'Perbaiki modul baris audit lama berdasar tipe dokumen (default: dry-run)';

    public function handle(): int
    {
        $plan = ['Transaksi' => 0, 'Stock Opname' => 0, 'Persediaan' => 0, 'dilewati' => 0];
        $targets = collect();

        AuditLog::query()
            ->where('auditable_type', 'StockDocument')
            ->where('module', 'Persediaan')
            ->whereNotNull('auditable_id')
            ->orderBy('id')
            ->chunkById(500, function ($rows) use (&$plan, &$targets) {
                $types = StockDocument::query()
                    ->whereIn('id', $rows->pluck('auditable_id')->all())
                    ->pluck('type', 'id');

                foreach ($rows as $row) {
                    $type = $types->get($row->auditable_id);
                    if ($type === null) {
                        $plan['dilewati']++;

                        continue;
                    }
                    $module = AuditLogger::moduleForStockDocumentType($type);
                    if ($module === 'Persediaan') {
                        $plan['Persediaan']++;

                        continue;
                    }
                    $plan[$module]++;
                    $targets->push(['id' => $row->id, 'module' => $module]);
                }
            });

        $this->info("Transaksi: {$plan['Transaksi']} | Stock Opname: {$plan['Stock Opname']} | ".
            "tetap Persediaan: {$plan['Persediaan']} | dilewati: {$plan['dilewati']}");

        if (! $this->option('apply')) {
            $this->info('Dry-run — tidak ada baris diubah. Jalankan dengan --apply untuk menulis.');

            return self::SUCCESS;
        }

        $fixed = 0;
        foreach ($targets->chunk(500) as $chunk) {
            foreach ($chunk->groupBy('module') as $module => $ids) {
                $fixed += AuditLog::query()->whereIn('id', $ids->pluck('id')->all())
                    ->update(['module' => $module]);
            }
        }

        $logged = AuditLogger::record([
            'action' => 'Update',
            'module' => 'System',
            'auditable_type' => 'Setting',
            'record_no' => 'Backfill modul audit',
            'new_values' => ['diperbaiki' => $fixed],
        ]);

        $this->info("Selesai — {$fixed} baris diperbaiki.".($logged ? ' Perbaikan tercatat di jejak.' : ''));

        return self::SUCCESS;
    }
}
