import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const { identifier, code, new_password } = await req.json();
  if (!identifier || !code || !new_password || String(new_password).length < 8) {
    return jsonResponse({ error: "Identifier, OTP code, and a secure password are required" }, 400);
  }

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const codeHash = await sha256(`${identifier}:password_reset:${code}:${Deno.env.get("OTP_PEPPER")}`);

  const { data: otp } = await supabase
    .from("otp_codes")
    .select("*")
    .eq("identifier", identifier)
    .eq("purpose", "password_reset")
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!otp || otp.code_hash !== codeHash) return jsonResponse({ error: "Invalid or expired code" }, 400);

  const isEmail = identifier.includes("@");
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .or(isEmail ? `email.eq.${identifier}` : `phone.eq.${identifier}`)
    .maybeSingle();
  if (!profile?.id) return jsonResponse({ error: "Account not found" }, 404);

  const { error } = await supabase.auth.admin.updateUserById(profile.id, { password: new_password });
  if (error) return jsonResponse({ error: error.message }, 500);

  await supabase.from("otp_codes").update({ consumed_at: new Date().toISOString() }).eq("id", otp.id);
  await supabase
    .from("password_reset_requests")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("identifier", identifier)
    .order("created_at", { ascending: false })
    .limit(1);

  await supabase.rpc("create_notification", {
    p_user_id: profile.id,
    p_type: "password_reset",
    p_title: "Password Reset",
    p_body: "Your ARBR account password was reset.",
    p_metadata: {},
  });
  return jsonResponse({ ok: true });
});
