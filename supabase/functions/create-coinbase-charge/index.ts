import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const COINBASE_API_URL = "https://api.commerce.coinbase.com/charges";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const coinbaseKey = Deno.env.get("COINBASE_COMMERCE_API_KEY")!;
  const appOrigin = Deno.env.get("APP_ORIGIN") || "https://arab-rial.com";

  const supabase = await import("https://esm.sh/@supabase/supabase-js@2").then(({ createClient }) =>
    createClient(supabaseUrl, serviceKey, { global: { headers: { Authorization: authHeader } } }),
  );
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return jsonResponse({ error: "Authentication required" }, 401);

  const { amount_omr, currency = "USDT" } = await req.json();
  const amount = Number(amount_omr || 0);
  if (!["USDT", "BTC", "ETH"].includes(currency) || amount <= 0) {
    return jsonResponse({ error: "Invalid deposit request" }, 400);
  }

  const chargeRes = await fetch(COINBASE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CC-Api-Key": coinbaseKey,
      "X-CC-Version": "2018-03-22",
    },
    body: JSON.stringify({
      name: "ARBR Deposit",
      description: `ARBR ${currency} deposit`,
      pricing_type: "fixed_price",
      local_price: { amount: amount.toFixed(3), currency: "OMR" },
      metadata: { user_id: auth.user.id, currency },
      redirect_url: `${appOrigin}/deposit.html`,
      cancel_url: `${appOrigin}/deposit.html`,
    }),
  });
  const chargeJson = await chargeRes.json();
  if (!chargeRes.ok) return jsonResponse({ error: chargeJson?.error?.message || "Coinbase charge failed" }, 502);

  const charge = chargeJson.data;
  await supabase.from("coinbase_transactions").insert({
    user_id: auth.user.id,
    charge_id: charge.id,
    hosted_url: charge.hosted_url,
    currency,
    amount_omr: amount,
    status: "created",
    raw_event: charge,
  });

  return jsonResponse({ charge_id: charge.id, hosted_url: charge.hosted_url });
});
