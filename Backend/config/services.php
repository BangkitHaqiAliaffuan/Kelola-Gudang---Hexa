<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | AI Assistant (F8) — kredensial penyedia LLM.
    |--------------------------------------------------------------------------
    | `groq` memakai API OpenAI-compatible. Key HANYA di .env (tak pernah
    | di-commit). Konfigurasi perilaku AI ada di config/ai.php.
    */

    'groq' => [
        'key' => env('GROQ_API_KEY'),
        'base_url' => env('GROQ_BASE_URL', 'https://api.groq.com/openai/v1'),
    ],

    /*
    |--------------------------------------------------------------------------
    | 9Router (AI gateway lokal, OpenAI-compatible)
    |--------------------------------------------------------------------------
    | Gateway multi-provider yang jalan lokal (Docker, default port 20128).
    | Base URL default http://127.0.0.1:20128/v1 (pakai 127.0.0.1, bukan
    | localhost, agar tidak kena isu resolusi IPv6). API key dari dashboard
    | 9Router. Aktifkan dengan AI_PROVIDER=9router.
    */

    'nine_router' => [
        'key' => env('NINEROUTER_API_KEY'),
        'base_url' => env('NINEROUTER_BASE_URL', 'http://127.0.0.1:20128/v1'),
    ],

];
