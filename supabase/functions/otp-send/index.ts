import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const { identifier, channel = "sms", purpose = "phone_verify" } = await req.json();
  if (!identifier || !["sms", "email"].includes(channel)) return jsonResponse({ error: "Invalid OTP request" }, 400);

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const allowed = await supabase.rpc("enforce_action_rate_limit", {
    p_action: "otp",
    p_user_id: null,
    p_ip: null,
    p_device_id: req.headers.get("x-device-id"),
    p_identifier: identifier,
  });
  if (allowed.error || !allowed.data) return jsonResponse({ error: "OTP rate limit exceeded" }, 429);

  const code = String(Math.floor(100000 + Math.random() * 900000));
  await supabase.from("otp_codes").insert({
    identifier,
    channel,
    purpose,
    code_hash: await sha256(`${identifier}:${purpose}:${code}:${Deno.env.get("OTP_PEPPER")}`),
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    device_id: req.headers.get("x-device-id"),
  });

  // Wire your SMS/email provider here. Keep provider secrets in Supabase function env.
  console.log(`OTP ${purpose} for ${identifier}: ${code}`);
  return jsonResponse({ ok: true, message: "OTP sent if provider is configured" });
});
