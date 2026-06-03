import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  // Production passkey verification requires a WebAuthn server library such as
  // @simplewebauthn/server and persistent challenges. This template is kept
  // explicit so credentials are never trusted by browser-only code.
  return jsonResponse({ ok: false, message: "Deploy with @simplewebauthn/server verification before enabling passkey login." }, 501);
});
