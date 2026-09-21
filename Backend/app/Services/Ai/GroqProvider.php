<?php

namespace App\Services\Ai;

/**
 * Alias tipis untuk OpenAiCompatibleProvider (nama lama "Groq"). Dipertahankan
 * agar test & kode lama tetap kompatibel. Gunakan OpenAiCompatibleProvider
 * untuk pemakaian baru (generik lintas penyedia OpenAI-compatible).
 */
final class GroqProvider extends OpenAiCompatibleProvider {}
