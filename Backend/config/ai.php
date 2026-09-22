<?php

return [

    /*
    |--------------------------------------------------------------------------
    | AI Assistant (F8) — konfigurasi perilaku
    |--------------------------------------------------------------------------
    |
    | Default MATI (enabled=false): tidak ada panggilan keluar sampai admin
    | sengaja mengaktifkan via env. Kredensial penyedia ada di config/services.php.
    |
    */

    'enabled' => (bool) env('AI_ENABLED', false),

    // Provider aktif: 'groq' | '9router' | 'openai_compatible' | 'ollama' | 'null'.
    // 'null' (atau AI_ENABLED=false) = AI mati (provider kosong, tanpa panggilan keluar).
    'provider' => env('AI_PROVIDER', 'groq'),

    // Model utama & cadangan (keduanya OpenAI-compatible di Groq).
    'model' => env('AI_MODEL', 'qwen/qwen3.8-27b'),
    'fallback_model' => env('AI_FALLBACK_MODEL', 'openai/gpt-oss-120b'),

    // Model guardrail (deteksi prompt-injection). Null = lompati (tidak disarankan).
    'guard_model' => env('AI_GUARD_MODEL', 'meta-llama/llama-prompt-guard-2-86m'),

    // Kuota harian per user (permintaan sukses). Akun Groq free ~1.000 req/hari.
    'daily_quota' => (int) env('AI_DAILY_QUOTA', 100),

    // Timeout HTTP (detik) untuk panggilan penyedia.
    'timeout' => (int) env('AI_TIMEOUT', 60),

    // Deadline keseluruhan satu chat (detik): orkestrator menyetop loop tool
    // bila anggaran ini terlampaui agar request tak gantung (risiko 504).
    'chat_deadline' => (int) env('AI_CHAT_DEADLINE', 90),

    // Batas token output per panggilan. Kecil = hemat kuota; tool call tidak
    // butuh output panjang. Naikkan bila jawaban analitik terpotong.
    'max_tokens' => (int) env('AI_MAX_TOKENS', 1024),

    // Jendela riwayat klarifikasi multi-turn (diselaraskan ChatAiRequest +
    // AiOrchestrator): N turn terakhir, tiap teks ≤ M karakter. Naikkan
    // bila konteks klarifikasi terasa sempit; biaya token ikut naik.
    'history_max_turns' => (int) env('AI_HISTORY_MAX_TURNS', 10),
    'history_per_turn' => (int) env('AI_HISTORY_PER_TURN', 1000),

    // Text-to-SQL read-only (F8.5). Koneksi DB baca-saja + batas.
    'sql_connection' => env('AI_SQL_CONNECTION', 'ai_readonly'),
    'sql_timeout_ms' => (int) env('AI_SQL_TIMEOUT_MS', 10000),
    'sql_max_rows' => (int) env('AI_SQL_MAX_ROWS', 200),

    // Fail-closed produksi: bila true, analisis_data menolak jalan kecuali
    // koneksi ai_readonly memakai user DB khusus (AI_DB_USERNAME, bukan
    // kredensial aplikasi). Default false agar dev/test tetap frictionless;
    // WAJIB true di produksi (lihat AI_ENFORCE_READER di .env.example).
    'enforce_reader' => (bool) env('AI_ENFORCE_READER', false),

    // Provider custom OpenAI-compatible (AI_PROVIDER=openai_compatible):
    // OpenRouter, vLLM, dsb — isi AI_BASE_URL + AI_API_KEY.
    'custom' => [
        'key' => env('AI_API_KEY'),
        'base_url' => env('AI_BASE_URL', ''),
    ],

    // Ollama lokal (AI_PROVIDER=ollama) — tanpa key.
    'ollama' => [
        'base_url' => env('OLLAMA_BASE_URL', 'http://127.0.0.1:11434/v1'),
    ],

];
