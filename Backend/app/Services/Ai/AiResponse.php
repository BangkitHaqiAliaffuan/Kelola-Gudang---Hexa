<?php

namespace App\Services\Ai;

/**
 * Hasil satu pemanggilan model: teks jawaban dan/atau usulan tool call.
 * Normalisasi lintas penyedia (Groq/OpenAI-compatible) agar lapisan atas
 * (orchestrator) tak bergantung pada bentuk mentah vendor.
 */
final class AiResponse
{
    /**
     * @param  array<int, ToolCall>  $toolCalls
     * @param  array<string, mixed>  $usage
     */
    public function __construct(
        public readonly ?string $content,
        public readonly array $toolCalls = [],
        public readonly string $model = '',
        public readonly array $usage = [],
    ) {}

    public function hasToolCalls(): bool
    {
        return $this->toolCalls !== [];
    }
}
