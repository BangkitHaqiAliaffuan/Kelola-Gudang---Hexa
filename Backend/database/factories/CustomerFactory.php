<?php

namespace Database\Factories;

use App\Models\Customer;
use App\Support\Npwp;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Customer>
 */
class CustomerFactory extends Factory
{
    protected $model = Customer::class;

    public function definition(): array
    {
        return [
            'code' => 'CUS-'.$this->faker->unique()->numberBetween(1000, 9999),
            'name' => $this->faker->unique()->company(),
            'legal_name' => $this->faker->company(),
            'nib' => $this->faker->unique()->numerify('#############'),
            'npwp' => Npwp::generate(),
            'phone' => $this->faker->phoneNumber(),
            'email' => $this->faker->unique()->companyEmail(),
            'pic_name' => $this->faker->name(),
            'website' => 'https://'.$this->faker->domainName(),
            'address' => $this->faker->streetAddress(),
            'city' => $this->faker->city(),
            'segment' => $this->faker->randomElement(['Retail', 'Distributor', 'Proyek', 'Korporat']),
            'bank_name' => $this->faker->randomElement(['BCA', 'Mandiri', 'BNI', 'BRI']),
            'bank_account_no' => (string) $this->faker->unique()->numberBetween(1000000000, 9999999999),
            'bank_account_name' => $this->faker->company(),
            'verification_status' => 'unverified',
            'verification_note' => null,
            'is_active' => true,
        ];
    }
}
