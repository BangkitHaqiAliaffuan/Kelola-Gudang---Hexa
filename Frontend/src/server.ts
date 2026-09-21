import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

// --- CSP nonce per-request (W5.1 pasca-audit) ---
// TanStack Start SSR selalu menyisipkan inline <script> (state hidrasi $tsr +
// chunk streaming dehydrated) yang isinya dinamis per request → hash CSP
// statis mustahil. Setiap respons HTML: generate nonce, tag semua <script>
// inline yang belum punya src/nonce, lalu kirim CSP dinamis. Script eksternal
// (/assets/…) tidak disentuh (lolos via 'self'). Aman dari false-positive:
// seroval meng-escape `<` payload menjadi `\x3C`, dan komponen app tidak
// merender string `<script` literal (terverifikasi via grep).
const INLINE_SCRIPT_RE = /<script(?![^>]*\bsrc=)(?![^>]*\bnonce=)/g;

function newCspNonce(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

function buildCsp(nonce: string): string {
  return (
    "default-src 'self'; " +
    `script-src 'self' 'nonce-${nonce}'; ` +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' data: https://fonts.gstatic.com; " +
    "img-src 'self' data: blob:; " +
    "connect-src 'self'; " +
    "frame-src 'self' blob:; " +
    "frame-ancestors 'none'; form-action 'self'; base-uri 'self'; object-src 'none'"
  );
}

async function withCspNonce(response: Response): Promise<Response> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response;
  const nonce = newCspNonce();
  const body = await response.text();
  const tagged = body.replace(INLINE_SCRIPT_RE, `<script nonce="${nonce}"`);
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", buildCsp(nonce));
  return new Response(tagged, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await withCspNonce(await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return await withCspNonce(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
  },
};
