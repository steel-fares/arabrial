import { crypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

async function hmacSha256(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const body = await req.text();
  const signature = req.headers.get("X-CC-Webhook-Signature") || "";
  const secret = Deno.env.get("COINBASE_WEBHOOK_SECRET")!;
  const expected = await hmacSha256(secret, body);
  if (signature !== expected) return jsonResponse({ error: "Invalid signature" }, 401);

  const event = JSON.parse(body);
  const charge = event?.event?.data;
  const chargeId = charge?.id;
  const eventType = event?.event?.type;
  if (!chargeId) return jsonResponse({ ok: true });

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const status = eventType === "charge:confirmed" ? "confirmed" : eventType === "charge:failed" ? "failed" : "pending";
  const payment = charge?.payments?.[0];
  const cryptoAmount = payment?.value?.crypto?.amount ? Number(payment.value.crypto.amount) : null;
  const cryptoCurrency = payment?.value?.crypto?.currency || charge?.metadata?.currency || null;

  const { data: tx } = await supabase
    .from("coinbase_transactions")
    .update({ status, crypto_amount: cryptoAmount, raw_event: event, credited_at: status === "confirmed" ? new Date().toISOString() : null })
    .eq("charge_id", chargeId)
    .select("*")
    .maybeSingle();

  if (status === "confirmed" && tx?.user_id && !tx.arbr_amount) {
    const arbrAmount = Number(tx.amount_omr || 0) / 0.00385;
    await supabase.from("coinbase_transactions").update({ arbr_amount: arbrAmount }).eq("id", tx.id);
    const { data: wallet } = await supabase.from("wallets").select("arbr_balance,total_deposit_omr").eq("user_id", tx.user_id).maybeSingle();
    await supabase.from("wallets").update({
      arbr_balance: Number(wallet?.arbr_balance || 0) + arbrAmount,
      total_deposit_omr: Number(wallet?.total_deposit_omr || 0) + Number(tx.amount_omr || 0),
      updated_at: new Date().toISOString(),
    }).eq("user_id", tx.user_id);
    await supabase.from("transactions").insert({
      user_id: tx.user_id,
      transaction_type: "coinbase_deposit",
      direction: "incoming",
      arbr_amount: arbrAmount,
      omr_amount: Number(tx.amount_omr || 0),
      crypto_amount: cryptoAmount,
      crypto_currency: cryptoCurrency,
      status: "completed",
      reference: chargeId,
      metadata: { source: "coinbase_commerce" },
    });
    await supabase.rpc("create_notification", {
      p_user_id: tx.user_id,
      p_type: "coinbase_deposit_confirmed",
      p_title: "Deposit Confirmed",
      p_body: "Your Coinbase Commerce deposit was detected. Admin review may still apply.",
      p_metadata: { charge_id: chargeId, crypto_currency: cryptoCurrency },
    });
  }

  return jsonResponse({ ok: true });
});
