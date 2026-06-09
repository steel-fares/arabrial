import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyRegistrationResponse, verifyAuthenticationResponse } from "npm:@simplewebauthn/server@9.0.3";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const appOrigin = Deno.env.get("APP_ORIGIN") || "https://arab-rial.com";

const expectedOrigins = [
  "https://arab-rial.com",
  "https://www.arab-rial.com",
  "https://steel-fares.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "http://localhost:8080"
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  
  try {
    const { mode, responseJSON, device_name } = await req.json();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const rpId = Deno.env.get("WEBAUTHN_RP_ID") || "arab-rial.com";
    
    // Extract challenge from responseJSON.response.clientDataJSON
    let clientDataJSONRaw = "";
    try {
      const decodedClientData = base64urlToUint8Array(responseJSON.response.clientDataJSON);
      clientDataJSONRaw = new TextDecoder().decode(decodedClientData);
    } catch (_) {
      return jsonResponse({ error: "Failed to parse clientDataJSON" }, 400);
    }
    
    const clientData = JSON.parse(clientDataJSONRaw);
    const challenge = clientData.challenge; // This is the signed challenge we sent
    
    if (mode === "registration") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);
      
      const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);
      
      // Verify signed challenge
      const isChallengeValid = await verifySignedChallenge(challenge, user.id);
      if (!isChallengeValid) {
        return jsonResponse({ error: "Invalid or expired challenge" }, 400);
      }
      
      const verification = await verifyRegistrationResponse({
        response: responseJSON,
        expectedChallenge: challenge,
        expectedOrigin: expectedOrigins,
        expectedRPID: rpId,
      });
      
      if (!verification.verified || !verification.registrationInfo) {
        return jsonResponse({ error: "WebAuthn verification failed" }, 400);
      }
      
      const { credentialPublicKey, credentialID, counter } = verification.registrationInfo;
      const publicKeyText = uint8ArrayToBase64url(credentialPublicKey);
      
      // Save passkey to DB
      const { error: dbError } = await supabase
        .from("passkeys")
        .insert({
          user_id: user.id,
          credential_id: credentialID,
          public_key: publicKeyText,
          counter: Number(counter),
          transports: responseJSON.response.transports || [],
          device_name: device_name || "Passkey Device",
        });
        
      if (dbError) {
        return jsonResponse({ error: `Database error: ${dbError.message}` }, 500);
      }
      
      // Log verification activity
      await supabase.from("verification_logs").insert({
        user_id: user.id,
        verification_type: "passkey",
        status: "registered",
        details: { device_name, credential_id: credentialID }
      }).catch(() => null);
      
      return jsonResponse({ ok: true, message: "Passkey registered successfully." }, 200);
      
    } else if (mode === "login") {
      // Verify signed challenge (for login, the signed payload has "login" as userId)
      const isChallengeValid = await verifySignedChallenge(challenge, "login");
      if (!isChallengeValid) {
        return jsonResponse({ error: "Invalid or expired challenge" }, 400);
      }
      
      // Match credential in DB
      const credentialID = responseJSON.id;
      const { data: passkey, error: passkeyError } = await supabase
        .from("passkeys")
        .select("*")
        .eq("credential_id", credentialID)
        .maybeSingle();
        
      if (passkeyError || !passkey) {
        return jsonResponse({ error: "Passkey credential not registered on this server" }, 404);
      }
      
      const storedPublicKey = base64urlToUint8Array(passkey.public_key);
      
      const verification = await verifyAuthenticationResponse({
        response: responseJSON,
        expectedChallenge: challenge,
        expectedOrigin: expectedOrigins,
        expectedRPID: rpId,
        authenticator: {
          credentialID: passkey.credential_id,
          credentialPublicKey: storedPublicKey,
          counter: Number(passkey.counter),
        },
      });
      
      if (!verification.verified || !verification.authenticationInfo) {
        return jsonResponse({ error: "Invalid authentication signature" }, 400);
      }
      
      const { newCounter } = verification.authenticationInfo;
      
      // Update counter and last used
      await supabase
        .from("passkeys")
        .update({
          counter: Number(newCounter),
          last_used_at: new Date().toISOString()
        })
        .eq("id", passkey.id);
        
      // Fetch user profile email
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("email, login_disabled, frozen_at, freeze_reason")
        .eq("id", passkey.user_id)
        .maybeSingle();
        
      if (profileError || !profile) {
        return jsonResponse({ error: "User profile not found" }, 404);
      }
      
      if (profile.login_disabled || profile.frozen_at) {
        const blockReason = profile.freeze_reason || "Account is frozen or login is disabled.";
        return jsonResponse({ error: blockReason }, 403);
      }
      
      // Generate magiclink login link
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: "magiclink",
        email: profile.email,
        options: { redirectTo: `${appOrigin}/dashboard.html` }
      });
      
      if (linkError || !linkData?.properties?.action_link) {
        return jsonResponse({ error: `Auth error: ${linkError?.message || "Failed to generate session link"}` }, 500);
      }
      
      return jsonResponse({
        ok: true,
        action_link: linkData.properties.action_link
      }, 200);
      
    } else {
      return jsonResponse({ error: "Invalid mode" }, 400);
    }
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
});

async function verifySignedChallenge(base64url: string, expectedUserId: string): Promise<boolean> {
  try {
    let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const raw = new TextDecoder().decode(bytes);
    
    const parts = raw.split(":");
    if (parts.length !== 3) return false;
    const [userId, expiresAtStr, signatureHex] = parts;
    
    if (userId !== expectedUserId && expectedUserId !== "login") return false;
    const expiresAt = parseInt(expiresAtStr);
    if (Date.now() > expiresAt) return false;
    
    const payload = `${userId}:${expiresAtStr}`;
    const encoder = new TextEncoder();
    const keyBuf = encoder.encode(supabaseServiceKey);
    const payloadBuf = encoder.encode(payload);
    
    const key = await crypto.subtle.importKey(
      "raw",
      keyBuf,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    
    const signatureBytes = new Uint8Array(signatureHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    const isValid = await crypto.subtle.verify("HMAC", key, signatureBytes, payloadBuf);
    return isValid;
  } catch {
    return false;
  }
}

function uint8ArrayToBase64url(arr: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < arr.byteLength; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlToUint8Array(base64url: string): Uint8Array {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
