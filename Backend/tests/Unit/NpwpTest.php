<?php

namespace Tests\Unit;

use App\Support\Npwp;
use PHPUnit\Framework\TestCase;

class NpwpTest extends TestCase
{
    public function test_accepts_valid_legacy_15_digit_npwp(): void
    {
        $this->assertTrue(Npwp::isValid('013121660091000'));
        $this->assertTrue(Npwp::isValid('01.312.166.0-091.000'));
        $this->assertTrue(Npwp::isValid('016090524017000'));
    }

    public function test_accepts_valid_16_digit_npwp_with_leading_zero(): void
    {
        $this->assertTrue(Npwp::isValid('0013121660091000'));
    }

    public function test_accepts_nik_as_npwp_format_only(): void
    {
        $this->assertTrue(Npwp::isValid('3171011708450001'));
    }

    public function test_rejects_invalid_npwp(): void
    {
        $this->assertFalse(Npwp::isValid('123456789'));
        $this->assertFalse(Npwp::isValid('999999999999999'));
        $this->assertFalse(Npwp::isValid(''));
        $this->assertFalse(Npwp::isValid(null));
        $this->assertFalse(Npwp::isValid('abcdefghijklmno'));
    }

    public function test_generate_returns_valid_16_digit_npwp(): void
    {
        for ($i = 0; $i < 10; $i++) {
            $generated = Npwp::generate();
            $this->assertSame(16, strlen($generated));
            $this->assertTrue(Npwp::isValid($generated));
        }
    }
}
