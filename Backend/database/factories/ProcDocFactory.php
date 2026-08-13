<?php

namespace Database\Factories;

use App\Models\Department;
use App\Models\ProcDoc;
use App\Models\Supplier;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ProcDoc>
 */
class ProcDocFactory extends Factory
{
    protected $model = ProcDoc::class;

    public function definition(): array
    {
        $date = $this->faker->dateTimeBetween('-60 days', 'now');

        return [
            'no' => 'PR/2026/'.$this->faker->unique()->numberBetween(1, 9999),
            'kind' => 'PR',
            'status' => 'Draft',
            'document_date' => $date,
            'need_date' => (clone $date)->modify('+7 days'),
            'requester_user_id' => User::factory(),
            'department_id' => Department::factory(),
            'supplier_id' => Supplier::factory(),
            'warehouse_id' => Warehouse::factory(),
            'reference' => 'BUDGET-'.$this->faker->unique()->numberBetween(1000, 9999),
            'note' => $this->faker->sentence(3),
            'submitted_at' => null,
            'approved_by' => null,
            'approved_at' => null,
            'decision_note' => null,
            'created_by' => User::factory(),
        ];
    }

    public function pendingApproval(): static
    {
        return $this->state(fn () => ['status' => 'Menunggu Approval', 'submitted_at' => now()]);
    }

    public function approved(): static
    {
        return $this->state(fn () => [
            'status' => 'Disetujui',
            'submitted_at' => now()->subDay(),
            'approved_by' => User::factory(),
            'approved_at' => now(),
        ]);
    }

    public function rejected(): static
    {
        return $this->state(fn () => [
            'status' => 'Ditolak',
            'submitted_at' => now()->subDay(),
            'approved_by' => User::factory(),
            'approved_at' => now(),
            'decision_note' => 'Barang di luar anggaran',
        ]);
    }
}
