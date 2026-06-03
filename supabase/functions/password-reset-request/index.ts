import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  const { identifier } = await req.json();
  if (!identifier) return jsonResponse({ error: "Identifier required" }, 400);

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const isEmail = identifier.includes("@");
  const { data: profile } = await supabase
    .from("profiles")
    .select("id,email,phone")
    .or(isEmail ? `email.eq.${identifier}` : `phone.eq.${identifier}`)
    .maybeSingle();

  await supabase.rpc("enforce_action_rate_limit", {
    p_action: "password_reset",
    p_user_id: profile?.id || null,
    p_ip: null,
    p_device_id: req.headers.get("x-device-id"),
    p_identifier: identifier,
  });
  await supabase.from("password_reset_requests").insert({
    user_id: profile?.id || null,
    identifier,
    channel: isEmail ? "email" : "sms",
    status: "code_sent",
    device_id: req.headers.get("x-device-id"),
    user_agent: req.headers.get("user-agent"),
  });
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await supabase.from("otp_codes").insert({
    user_id: profile?.id || null,
    identifier,
    channel: isEmail ? "email" : "sms",
    purpose: "password_reset",
    code_hash: await sha256(`${identifier}:password_reset:${code}:${Deno.env.get("OTP_PEPPER")}`),
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    device_id: req.headers.get("x-device-id"),
  });
  console.log(`Password reset OTP for ${identifier}: ${code}`);

  return jsonResponse({ ok: true, message: "If the account exists, reset instructions were sent." });
});
