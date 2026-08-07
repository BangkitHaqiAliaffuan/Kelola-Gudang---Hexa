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
    | (see `dev.sh`) — a cross-origin fetch. No auth/credentials yet, so `*`
    | is acceptable; tighten `allowed_origins` once USER/ROLE ship.
    |
    */

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => ['*'],

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => false,

];
