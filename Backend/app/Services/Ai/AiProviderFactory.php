<?php

namespace App\Services\Ai;

/**
 * Memilih implementasi AiProvider dari config (`config/ai.php`).
 *
 * Single source of truth pemilihan provider — dipakai binding container &
 * test. Provider tak dikenal atau AI mati → NullProvider (fail-safe: tak ada
 * panggilan keluar).
 *
 * Semua provider di bawah berbicara protokol OpenAI-compatible, jadi memakai
 * SATU kelas (OpenAiCompatibleProvider) dengan base URL + key + model berbeda:
 * - `groq`             → Groq (api.groq.com/openai/v1).
 * - `9router`/`ninerouter` → gateway lokal 9Router (127.0.0.1:20128/v1).
 * - `openai_compatible`→ custom via AI_BASE_URL/AI_API_KEY (OpenRouter, vLLM…).
 * - `ollama`           → lokal tanpa key (127.0.0.1:11434/v1).
 */
final class AiProviderFactory
{
    public static function make(): AiProvider
    {
        if (! config('ai.enabled')) {
            return new NullProvider;
        }

        return match (config('ai.provider')) {
            'groq' => new OpenAiCompatibleProvider(
                apiKey: config('services.groq.key'),
                baseUrl: (string) config('services.groq.base_url'),
                model: (string) config('ai.model'),
                fallbackModel: (string) config('ai.fallback_model'),
                guardModel: config('ai.guard_model'),
                timeout: (int) config('ai.timeout'),
            ),
            '9router', 'ninerouter', 'nine_router' => new OpenAiCompatibleProvider(
                apiKey: config('services.nine_router.key'),
                baseUrl: (string) config('services.nine_router.base_url'),
                model: (string) config('ai.model'),
                fallbackModel: (string) config('ai.fallback_model'),
                guardModel: config('ai.guard_model'),
                timeout: (int) config('ai.timeout'),
            ),
            'openai_compatible' => new OpenAiCompatibleProvider(
                apiKey: config('ai.custom.key'),
                baseUrl: (string) config('ai.custom.base_url'),
                model: (string) config('ai.model'),
                fallbackModel: (string) config('ai.fallback_model'),
                guardModel: config('ai.guard_model'),
                timeout: (int) config('ai.timeout'),
            ),
            'ollama' => new OpenAiCompatibleProvider(
                apiKey: 'ollama', // Ollama abaikan key, tapi Http butuh non-empty
                baseUrl: (string) config('ai.ollama.base_url'),
                model: (string) config('ai.model'),
                fallbackModel: (string) config('ai.fallback_model'),
                guardModel: config('ai.guard_model'),
                timeout: (int) config('ai.timeout'),
            ),
            default => new NullProvider,
        };
    }
}
