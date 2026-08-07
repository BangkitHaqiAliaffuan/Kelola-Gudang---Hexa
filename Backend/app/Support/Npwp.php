<?php

namespace App\Support;

class Npwp
{
    /**
     * Validate an Indonesian NPWP.
     *
     * Strips separators (dots/dashes/spaces), then:
     *  - 15 digits (legacy): Luhn checksum over the first 9 digits.
     *  - 16 digits starting with "0" (2024 format: "0" + legacy NPWP): Luhn
     *    checksum over the first 10 digits.
     *  - 16 digits not starting with "0" (NIK used as NPWP): format-only
     *    validation (NIK has no reliable offline checksum).
     */
    public static function isValid(?string $npwp): bool
    {
        if ($npwp === null || $npwp === '') {
            return false;
        }

        $digits = preg_replace('/\D/', '', $npwp);
        if (! is_string($digits) || strlen($digits) === 0) {
            return false;
        }

        return match (strlen($digits)) {
            15 => self::luhn(substr($digits, 0, 9)),
            16 => $digits[0] === '0' ? self::luhn(substr($digits, 0, 10)) : true,
            default => false,
        };
    }

    /**
     * Generate a random valid NPWP (16-digit format: "0" + legacy NPWP).
     */
    public static function generate(): string
    {
        $data = '0'
            .random_int(0, 9).random_int(0, 9).random_int(0, 9)
            .random_int(0, 9).random_int(0, 9).random_int(0, 9)
            .random_int(0, 9).random_int(0, 9);

        $kpp = random_int(100, 999);
        $branch = random_int(0, 999);

        return $data
            .self::luhnCheckDigit($data)
            .str_pad((string) $kpp, 3, '0', STR_PAD_LEFT)
            .str_pad((string) $branch, 3, '0', STR_PAD_LEFT);
    }

    /**
     * Luhn (mod 10) checksum over the full number (check digit included).
     */
    private static function luhn(string $number): bool
    {
        $sum = 0;
        $parity = strlen($number) % 2;

        for ($i = 0; $i < strlen($number); $i++) {
            $digit = (int) $number[$i];
            if ($i % 2 === $parity) {
                $digit *= 2;
                if ($digit > 9) {
                    $digit -= 9;
                }
            }
            $sum += $digit;
        }

        return $sum % 10 === 0;
    }

    /**
     * Compute the Luhn check digit for the given number (without it).
     */
    private static function luhnCheckDigit(string $number): int
    {
        $sum = 0;
        $parity = (strlen($number) + 1) % 2;

        for ($i = 0; $i < strlen($number); $i++) {
            $digit = (int) $number[$i];
            if ($i % 2 === $parity) {
                $digit *= 2;
                if ($digit > 9) {
                    $digit -= 9;
                }
            }
            $sum += $digit;
        }

        return (10 - ($sum % 10)) % 10;
    }
}
