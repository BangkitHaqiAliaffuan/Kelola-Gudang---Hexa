<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | `HandleCors` runs in the default global middleware stack, but only sends
    | headers when this file configures matching paths. Needed so the Vercel
    | production frontend can call the local backend through the ngrok tunnel
    | (see `dev.sh`) — a cross-origin fetch. Cookie-based auth needs
    | `supports_credentials` and explicit origins (cannot be `*` with
    | credentials), driven by `FRONTEND_URL` (comma-separated).
    |
    */

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => array_values(array_filter(
        explode(',', (string) env('FRONTEND_URL', 'http://localhost:8080'))
    )),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => true,

];
