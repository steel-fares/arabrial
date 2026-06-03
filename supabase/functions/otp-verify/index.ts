import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  const { identifier, code, purpose = "phone_verify" } = await req.json();
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: auth } = await supabase.auth.getUser();
  const codeHash = await sha256(`${identifier}:${purpose}:${code}:${Deno.env.get("OTP_PEPPER")}`);
  const { data: otp } = await supabase
    .from("otp_codes")
    .select("*")
    .eq("identifier", identifier)
    .eq("purpose", purpose)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!otp || otp.code_hash !== codeHash) return jsonResponse({ error: "Invalid or expired OTP" }, 400);

  await supabase.from("otp_codes").update({ consumed_at: new Date().toISOString() }).eq("id", otp.id);
  if (auth.user && purpose === "phone_verify") {
    await supabase.from("profiles").update({ phone: identifier, phone_verified_at: new Date().toISOString() }).eq("id", auth.user.id);
    await supabase.from("verification_logs").insert({ user_id: auth.user.id, verification_type: "phone", status: "verified" });
  }
  return jsonResponse({ ok: true });
});
