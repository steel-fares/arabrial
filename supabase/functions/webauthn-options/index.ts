import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const challenge = crypto.randomUUID().replaceAll("-", "");
  return jsonResponse({
    challenge,
    rp: { name: "ARBR", id: Deno.env.get("WEBAUTHN_RP_ID") || "arab-rial.com" },
    timeout: 60000,
    userVerification: "preferred",
  });
});
