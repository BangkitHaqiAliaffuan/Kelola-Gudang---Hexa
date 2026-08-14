<?php

namespace Database\Seeders;

use App\Models\Department;
use App\Models\Item;
use App\Models\ProcDoc;
use App\Models\ProcDocLine;
use App\Models\Supplier;
use App\Models\User;
use App\Models\Warehouse;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Seed dokumen pengadaan demo: 60 Purchase Request (mencerminkan data dummy
 * lama di Frontend — makeProc("PR",60,"PR")) + ~15 Purchase Order yang
 * dirujuk ke PR berstatus Disetujui (bila ada).
 *
 * Run standalone pada DB yang sudah ter-seed:
 *   php artisan db:seed --class=ProcDocSeeder
 */
class ProcDocSeeder extends Seeder
{
    private const REFERENCE_DATE = '2026-07-31';

    private const PR_STATUSES = [
        'Draft',
        'Menunggu Approval',
        'Disetujui',
        'Disetujui',
        'Ditolak',
    ];

    private const NOTES = [
        'Kebutuhan operasional rutin',
        'Restock item minimum',
        'Permintaan proyek berjalan',
        'Penggantian sparepart mesin',
        'Pengadaan tahunan',
    ];

    public function run(): void
    {
        $state = 20260731;
        $rnd = static function () use (&$state): float {
            $state = ($state * 1664525 + 1013904223) & 0xFFFFFFFF;

            return $state / 4294967296.0;
        };
        $int = static function (int $min, int $max) use ($rnd): int {
            return (int) floor($rnd() * ($max - $min + 1)) + $min;
        };
        $pick = static function (array $list) use ($int) {
            return $list[$int(0, count($list) - 1)];
        };

        $ref = CarbonImmutable::parse(self::REFERENCE_DATE);
        $users = User::orderBy('id')->get()->all();
        $departments = Department::orderBy('id')->get()->all();
        $suppliers = Supplier::orderBy('id')->get()->all();
        $warehouses = Warehouse::orderBy('id')->get()->all();
        $items = Item::orderBy('id')->get()->all();

        if ($users === [] || $departments === [] || $suppliers === [] || $warehouses === [] || $items === []) {
            return;
        }

        DB::transaction(function () use ($ref, $int, $pick, $users, $departments, $suppliers, $warehouses, $items) {
            if (! ProcDoc::where('kind', 'PR')->exists()) {
                for ($i = 0; $i < 60; $i++) {
                    $date = $ref->subDays($int(0, 200))->setTime($int(7, 17), $int(0, 59), 0);
                    $need = $date->addDays($int(3, 30))->startOfDay();

                    $lines = [];
                    for ($j = 0, $count = $int(1, 5); $j < $count; $j++) {
                        $item = $pick($items);
                        $lines[] = [
                            'item' => $item,
                            'qty' => $int(5, 250),
                            'price' => (float) $item->cost,
                        ];
                    }

                    $requester = $pick($users);
                    $status = $pick(self::PR_STATUSES);
                    $approved = in_array($status, ['Disetujui', 'Ditolak'], true);

                    $doc = ProcDoc::create([
                        'no' => 'PR/2026/'.str_pad((string) ($i + 1), 4, '0', STR_PAD_LEFT),
                        'kind' => 'PR',
                        'status' => $status,
                        'document_date' => $date,
                        'need_date' => $need,
                        'requester_user_id' => $requester->id,
                        'department_id' => $pick($departments)->id,
                        'supplier_id' => $pick($suppliers)->id,
                        'warehouse_id' => $pick($warehouses)->id,
                        'reference' => 'BUDGET-'.$int(1000, 9999),
                        'note' => $pick(self::NOTES),
                        'submitted_at' => $status === 'Draft' ? null : $date,
                        'approved_by' => $approved ? $pick($users)->id : null,
                        'approved_at' => $approved ? $date->addHours(3) : null,
                        'decision_note' => $status === 'Ditolak' ? 'Barang melebihi anggaran departemen.' : null,
                        'created_by' => $requester->id,
                    ]);

                    foreach ($lines as $index => $line) {
                        ProcDocLine::create([
                            'proc_doc_id' => $doc->id,
                            'line_no' => $index + 1,
                            'item_id' => $line['item']->id,
                            'qty' => $line['qty'],
                            'unit_id' => $line['item']->unit_id,
                            'price' => $line['price'],
                        ]);
                    }
                }
            }

            if (! ProcDoc::where('kind', 'PO')->exists()) {
                $approvedPRs = ProcDoc::where('kind', 'PR')
                    ->where('status', 'Disetujui')
                    ->orderBy('id')
                    ->get();

                foreach ($approvedPRs->take(15) as $index => $pr) {
                    $poDate = $pr->document_date->addDays($int(1, 5))->setTime($int(7, 17), $int(0, 59), 0);

                    $po = ProcDoc::create([
                        'no' => 'PO/2026/'.str_pad((string) ($index + 1), 4, '0', STR_PAD_LEFT),
                        'kind' => 'PO',
                        'status' => 'Draft',
                        'document_date' => $poDate,
                        'need_date' => $pr->need_date,
                        'requester_user_id' => $pr->requester_user_id,
                        'department_id' => $pr->department_id,
                        'supplier_id' => $pr->supplier_id,
                        'warehouse_id' => $pr->warehouse_id,
                        'source_proc_doc_id' => $pr->id,
                        'reference' => $pr->reference,
                        'note' => $pr->note,
                        'created_by' => $pr->requester_user_id,
                    ]);

                    foreach ($pr->lines as $lineIndex => $line) {
                        ProcDocLine::create([
                            'proc_doc_id' => $po->id,
                            'line_no' => $lineIndex + 1,
                            'item_id' => $line->item_id,
                            'qty' => $line->qty,
                            'unit_id' => $line->unit_id,
                            'price' => $line->price,
                        ]);
                    }
                }
            }
        });
    }
}
