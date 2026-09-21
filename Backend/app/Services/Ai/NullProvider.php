<?php

namespace App\Services\Ai;

/**
 * Provider "mati": dipakai saat AI_ENABLED=false atau provider tak dikenal.
 * Semua panggilan melempar AiProviderException → controller membalas 503
 * ramah. Menjamin tak ada panggilan keluar saat fitur belum diaktifkan.
 */
final class NullProvider implements AiProvider
{
    public function isAvailable(): bool
    {
        return false;
    }

    public function chat(array $messages, array $tools = [], bool $jsonMode = false): AiResponse
    {
        throw new AiProviderException('Fitur AI Assistant sedang tidak aktif.');
    }

    public function guardScore(string $text): ?float
    {
        return null;
    }
}
