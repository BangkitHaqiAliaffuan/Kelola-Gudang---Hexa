<?php

namespace Database\Factories;

use App\Models\RolePermission;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<RolePermission>
 */
class RolePermissionFactory extends Factory
{
    protected $model = RolePermission::class;

    public function definition(): array
    {
        return [
            'role' => $this->faker->randomElement(['Administrator', 'Supervisor', 'Operator Gudang', 'Auditor']),
            'module' => $this->faker->randomElement(RolePermission::MODULES),
            'level' => $this->faker->randomElement(RolePermission::LEVELS),
        ];
    }
}
