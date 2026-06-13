import { supabase } from './supabase';

export interface UsdtPriceData {
  market_price_usd: number;
  market_price_omr: number;
  buy_price_omr: number;
  sell_price_omr: number;
  buy_spread_percent: number;
  sell_spread_percent: number;
  price_lock_seconds: number;
  min_transaction: number;
  max_transaction: number;
  source: string;
  timestamp: string;
}

export async function fetchUsdtPriceClient(): Promise<UsdtPriceData> {
  // 1. Fetch USDT Exchange settings
  const { data: settings, error: settingsError } = await supabase
    .from('usdt_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (settingsError) {
    console.error('Error fetching settings:', settingsError);
  }

  const buySpread = settings?.buy_spread_percent ? Number(settings.buy_spread_percent) : 3.00;
  const sellSpread = settings?.sell_spread_percent ? Number(settings.sell_spread_percent) : 3.00;
  const minTx = settings?.min_transaction ? Number(settings.min_transaction) : 10.00;
  const maxTx = settings?.max_transaction ? Number(settings.max_transaction) : 10000.00;
  const priceLock = settings?.price_lock_seconds ? Number(settings.price_lock_seconds) : 60;

  // 2. Fetch live Tether price from CoinGecko
  let marketPriceUsd = 1.000000;
  let marketPriceOmr = 0.385000;
  let source = 'coingecko';
  let isSuccess = false;

  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=omr,usd', {
      headers: { 'Accept': 'application/json' }
    });

    if (res.ok) {
      const data = await res.json();
      if (data.tether && data.tether.omr && data.tether.usd) {
        marketPriceUsd = Number(data.tether.usd);
        marketPriceOmr = Number(data.tether.omr);
        isSuccess = true;
      }
    }
  } catch (e) {
    console.warn('Failed to fetch from CoinGecko, trying database fallback:', e);
  }

  // 3. Fallback to last recorded price in database if CoinGecko failed
  if (!isSuccess) {
    const { data: lastPrice, error: priceError } = await supabase
      .from('usdt_price_history')
      .select('*')
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!priceError && lastPrice) {
      marketPriceUsd = Number(lastPrice.market_price_usd);
      marketPriceOmr = Number(lastPrice.market_price_omr);
      source = 'fallback_db';
      isSuccess = true;
    } else {
      marketPriceUsd = 1.000000;
      marketPriceOmr = 0.385000;
      source = 'absolute_fallback';
    }
  }

  // 4. Calculate prices with spreads
  const buyPriceOmr = Number((marketPriceOmr * (1 + buySpread / 100)).toFixed(6));
  const sellPriceOmr = Number((marketPriceOmr * (1 - sellSpread / 100)).toFixed(6));

  // 5. Store current price in history if older than 60s
  try {
    const { data: lastRecord } = await supabase
      .from('usdt_price_history')
      .select('recorded_at')
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const shouldInsert = !lastRecord || (new Date().getTime() - new Date(lastRecord.recorded_at).getTime() > 60000);

    if (shouldInsert) {
      await supabase.from('usdt_price_history').insert({
        market_price_usd: marketPriceUsd,
        market_price_omr: marketPriceOmr,
        buy_price_omr: buyPriceOmr,
        sell_price_omr: sellPriceOmr,
        source: source
      });
    }
  } catch (dbErr) {
    console.error('Error inserting price history:', dbErr);
  }

  return {
    market_price_usd: marketPriceUsd,
    market_price_omr: marketPriceOmr,
    buy_price_omr: buyPriceOmr,
    sell_price_omr: sellPriceOmr,
    buy_spread_percent: buySpread,
    sell_spread_percent: sellSpread,
    price_lock_seconds: priceLock,
    min_transaction: minTx,
    max_transaction: maxTx,
    source: source,
    timestamp: new Date().toISOString()
  };
}
