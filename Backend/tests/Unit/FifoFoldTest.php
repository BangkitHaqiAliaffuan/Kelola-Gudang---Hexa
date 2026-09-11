<?php

namespace Tests\Unit;

use App\Support\FifoFold;
use PHPUnit\Framework\TestCase;

class FifoFoldTest extends TestCase
{
    /**
     * Implementasi referensi: pola array_shift lama di fold ledger.
     *
     * @param  list<array{dir: string, qty: int, cost: float}>  $events
     */
    private function referenceValue(array $events): float
    {
        $layers = [];

        foreach ($events as $e) {
            if ($e['dir'] === 'IN') {
                $layers[] = ['qty' => $e['qty'], 'cost' => $e['cost']];
            } else {
                $remaining = $e['qty'];
                while ($remaining > 0 && $layers !== []) {
                    $take = min($remaining, $layers[0]['qty']);
                    $layers[0]['qty'] -= $take;
                    $remaining -= $take;

                    if ($layers[0]['qty'] === 0) {
                        array_shift($layers);
                    }
                }
            }
        }

        return array_sum(array_map(fn ($l) => $l['qty'] * $l['cost'], $layers));
    }

    /** @param  list<array{dir: string, qty: int, cost: float}>  $events */
    private function foldValue(array $events): float
    {
        $fold = new FifoFold;

        foreach ($events as $e) {
            if ($e['dir'] === 'IN') {
                $fold->push($e['qty'], $e['cost']);
            } else {
                $fold->consume($e['qty']);
            }
        }

        return $fold->value();
    }

    public function test_paritas_dengan_array_shift_prng_deterministik(): void
    {
        mt_srand(20260910);

        for ($trial = 0; $trial < 50; $trial++) {
            $events = [];
            $n = mt_rand(1, 200);
            for ($i = 0; $i < $n; $i++) {
                $events[] = [
                    'dir' => mt_rand(0, 1) === 0 ? 'IN' : 'OUT',
                    'qty' => mt_rand(1, 100),
                    'cost' => (float) mt_rand(100, 10000),
                ];
            }

            $this->assertEqualsWithDelta(
                $this->referenceValue($events),
                $this->foldValue($events),
                0.0001,
                "trial {$trial} divergen"
            );
        }
    }

    public function test_konsumsi_melebihi_lapis_berhenti_diam_diam(): void
    {
        $fold = new FifoFold;
        $fold->push(10, 100.0);
        $fold->consume(999);

        $this->assertSame(0.0, $fold->value());
    }

    public function test_lapis_kosong_tidak_mengganggu(): void
    {
        $fold = new FifoFold;
        $fold->push(10, 100.0);
        $fold->consume(10);
        $fold->push(5, 200.0);

        $this->assertSame(1000.0, $fold->value());
    }
}
