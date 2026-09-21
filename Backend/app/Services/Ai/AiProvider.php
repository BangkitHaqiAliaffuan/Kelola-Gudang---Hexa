<?php

namespace App\Services\Ai;

/**
 * Kontrak penyedia LLM (provider-agnostic). Implementasi saat ini:
 * - GroqProvider  → API OpenAI-compatible Groq (qwen/gpt-oss).
 * - NullProvider  → AI dimatikan (tak ada panggilan keluar).
 *
 * Lapisan atas (AiOrchestrator) hanya bergantung pada antarmuka ini sehingga
 * penggantian vendor (Groq/OpenRouter/Ollama) tak menyentuh domain code.
 */
interface AiProvider
{
    /**
     * Apakah provider siap dipakai (enabled + kredensial terisi).
     */
    public function isAvailable(): bool;

    /**
     * Kirim percakapan ke model; kembalikan teks dan/atau usulan tool call.
     *
     * @param  array<int, AiMessage>  $messages
     * @param  array<int, array<string, mixed>>  $tools  Definisi tool (OpenAI-style) — kosong = tanpa tool.
     * @param  bool  $jsonMode  Paksa output JSON valid (untuk text-to-SQL/usulan terstruktur).
     *
     * @throws AiProviderException saat provider mati, kredensial kurang, atau API gagal.
     */
    public function chat(array $messages, array $tools = [], bool $jsonMode = false): AiResponse;

    /**
     * Skor deteksi prompt-injection (0..1; makin tinggi makin mencurigakan).
     * Mengembalikan null bila guardrail tak tersedia/tak dikonfigurasi.
     */
    public function guardScore(string $text): ?float;
}
