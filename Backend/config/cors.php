<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | `HandleCors` runs in the default global middleware stack, but only sends
    | headers when this file configures matching paths. Kept for any direct
    | cross-origin access to the API (e.g. tooling hitting the ngrok tunnel).
    | The SPA now calls the backend same-origin through the Vercel rewrite
    | (Frontend/vercel.json), and auth is bearer-token based, so CORS is not
    | engaged for normal browser traffic. Origins come from `FRONTEND_URL`
    | (comma-separated).
    |
    */

    'paths' => ['api/*'],

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
