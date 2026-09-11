<?php

namespace App\Support;

/**
 * Fase 2.5 — antrean lapisan FIFO ber-pointer.
 *
 * Pengganti drop-in untuk pola `$fifoLayers[] = ...` + `array_shift($fifoLayers)`
 * di fold ledger (StockController::stockCard/valuation, LaporanController::mutasi).
 * `array_shift` menggeser seluruh array setiap lapis habis (O(n²) untuk n lapis);
 * helper ini memajukan indeks `$head` (O(1) amortisasi) dengan hasil identik.
 *
 * Semantik konsumsi dipertahankan persis dari implementasi lama:
 * - ambil dari lapis terdepan dulu (`min(sisa, qty lapis)`),
 * - lapis yang qty-nya nol dilewati,
 * - konsumsi melebihi total lapis berhenti diam-diam (sisa diabaikan).
 */
final class FifoFold
{
    /** @var list<array{qty: int|float, cost: float}> */
    private array $layers = [];

    private int $head = 0;

    public function push(int|float $qty, float $cost): void
    {
        $this->layers[] = ['qty' => $qty, 'cost' => $cost];
    }

    public function consume(int|float $qty): void
    {
        $remaining = $qty;
        $count = count($this->layers);

        while ($remaining > 0 && $this->head < $count) {
            $take = min($remaining, $this->layers[$this->head]['qty']);
            $this->layers[$this->head]['qty'] -= $take;
            $remaining -= $take;

            if ($this->layers[$this->head]['qty'] === 0 || $this->layers[$this->head]['qty'] === 0.0) {
                $this->head++;
            }
        }

        // Bebaskan awalan yang sudah terkonsumsi agar memori tidak tumbuh
        // bersama jumlah lapis historis (array_shift lama membebaskannya langsung).
        if ($this->head > 1024 && $this->head * 2 > $count) {
            $this->layers = array_slice($this->layers, $this->head);
            $count = count($this->layers);
            $this->head = 0;
        }
    }

    public function value(): float
    {
        $total = 0.0;
        $count = count($this->layers);

        for ($i = $this->head; $i < $count; $i++) {
            $total += $this->layers[$i]['qty'] * $this->layers[$i]['cost'];
        }

        return $total;
    }
}
