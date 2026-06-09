import { createClient } from "npm:@supabase/supabase-js@2";
import { generateRegistrationOptions, generateAuthenticationOptions } from "npm:@simplewebauthn/server@9.0.3";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  
  try {
    const { mode } = await req.json();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const rpId = Deno.env.get("WEBAUTHN_RP_ID") || "arab-rial.com";
    
    if (mode === "registration") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);
      
      const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);
      
      // Fetch user's existing passkeys
      const { data: passkeys } = await supabase
        .from("passkeys")
        .select("credential_id")
        .eq("user_id", user.id);
        
      const signedChallenge = await generateSignedChallenge(user.id);
      
      const options = await generateRegistrationOptions({
        rpName: "ARBR",
        rpID: rpId,
        userID: new TextEncoder().encode(user.id),
        userName: user.email || user.id,
        userDisplayName: user.user_metadata?.full_name || user.email || "ARBR user",
        challenge: signedChallenge,
        excludeCredentials: (passkeys || []).map(p => ({
          id: p.credential_id,
          type: "public-key",
        })),
        authenticatorSelection: {
          userVerification: "preferred",
          residentKey: "preferred",
        },
      });
      
      return jsonResponse(options, 200);
      
    } else if (mode === "login") {
      const signedChallenge = await generateSignedChallenge("login");
      
      const options = await generateAuthenticationOptions({
        rpID: rpId,
        challenge: signedChallenge,
        userVerification: "preferred",
      });
      
      return jsonResponse(options, 200);
    } else {
      return jsonResponse({ error: "Invalid mode" }, 400);
    }
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
});

async function generateSignedChallenge(userId: string): Promise<string> {
  const expiresAt = Date.now() + 5 * 60 * 1000;
  const payload = `${userId}:${expiresAt}`;
  const encoder = new TextEncoder();
  const keyBuf = encoder.encode(supabaseServiceKey);
  const payloadBuf = encoder.encode(payload);
  
  const key = await crypto.subtle.importKey(
    "raw",
    keyBuf,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBuf = await crypto.subtle.sign("HMAC", key, payloadBuf);
  const signatureArray = new Uint8Array(signatureBuf);
  const signatureHex = Array.from(signatureArray).map(b => b.toString(16).padStart(2, '0')).join('');
  
  const token = `${payload}:${signatureHex}`;
  const bytes = encoder.encode(token);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
