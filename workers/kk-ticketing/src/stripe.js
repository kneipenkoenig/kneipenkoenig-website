/**
 * Stripe API-Aufrufe (kein SDK, reines fetch – Worker-kompatibel)
 */

export async function createCheckoutSession(env, { orderNumber, eventTitle, amount, currency, customerEmail, successUrl, cancelUrl, metadata }) {
  const params = new URLSearchParams();
  params.append('mode', 'payment');
  params.append('customer_email', customerEmail);
  params.append('success_url', successUrl);
  params.append('cancel_url', cancelUrl);
  params.append('line_items[0][price_data][currency]', currency.toLowerCase());
  params.append('line_items[0][price_data][unit_amount]', Math.round(amount * 100).toString());
  params.append('line_items[0][price_data][product_data][name]', eventTitle);
  params.append('line_items[0][quantity]', '1');
  params.append('payment_intent_data[metadata][order_number]', orderNumber);
  params.append('payment_intent_data[metadata][order_id]', metadata.order_id);

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Stripe error: ${data.error?.message || res.status}`);
  return data;
}


export async function verifyWebhookSignature(secret, payload, sigHeader) {
  const parts = sigHeader.split(',').reduce((acc, part) => {
    const [k, v] = part.split('=');
    if (k === 't') acc.timestamp = v;
    if (k === 'v1') acc.signatures.push(v);
    return acc;
  }, { timestamp: null, signatures: [] });

  if (!parts.timestamp || parts.signatures.length === 0) {
    throw new Error('Invalid Stripe signature header');
  }

  // Toleranz: 5 Minuten
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(parts.timestamp)) > 300) {
    throw new Error('Stripe webhook timestamp too old');
  }

  const signedPayload = `${parts.timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const computed = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');

  const valid = parts.signatures.some(s => s === computed);
  if (!valid) throw new Error('Invalid Stripe webhook signature');

  return JSON.parse(payload);
}
