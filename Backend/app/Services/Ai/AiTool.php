<?php

namespace App\Services\Ai;

/**
 * Definisi satu tool yang boleh dipanggil AI (bagian dari allowlist tertutup).
 *
 * - `module`/`level`: gate RBAC yang dicek terhadap role user sebelum eksekusi
 *   (mirror RoleAccessLevels). Tool call tak berizin → ditolak.
 * - `risk`: low | medium | high | critical → menentukan apakah butuh konfirmasi
 *   manusia (lihat AiOrchestrator / aturan HITL).
 * - `readOnly`: true = aman (tak mengubah data), false = menulis.
 * - `schema`: JSON-schema parameter (dikirim ke model sebagai definisi function).
 */
final class AiTool
{
    public const RISK_LOW = 'low';

    public const RISK_MEDIUM = 'medium';

    public const RISK_HIGH = 'high';

    public const RISK_CRITICAL = 'critical';

    /**
     * @param  array<string, mixed>  $schema
     */
    public function __construct(
        public readonly string $name,
        public readonly string $description,
        public readonly array $schema,
        public readonly string $module,
        public readonly string $level,
        public readonly string $risk,
        public readonly bool $readOnly,
    ) {}

    /**
     * Definisi tool versi OpenAI (untuk parameter `tools` chat/completions).
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'type' => 'function',
            'function' => [
                'name' => $this->name,
                'description' => $this->description,
                'parameters' => $this->schema,
            ],
        ];
    }

    public function requiresConfirmation(): bool
    {
        return ! $this->readOnly;
    }
}
