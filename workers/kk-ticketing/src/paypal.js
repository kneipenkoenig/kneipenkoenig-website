/**
 * PayPal API-Aufrufe (kein SDK, reines fetch – Worker-kompatibel)
 */

const PAYPAL_API = 'https://api-m.paypal.com'; // Live
// const PAYPAL_API = 'https://api-m.sandbox.paypal.com'; // Sandbox

async function getAccessToken(env) {
  const auth = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_SECRET}`);

  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`PayPal auth error: ${data.error_description || res.status}`);
  return data.access_token;
}


export async function createOrder(env, { orderNumber, eventTitle, amount, currency }) {
  const token = await getAccessToken(env);

  const res = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: orderNumber,
        description: eventTitle,
        amount: {
          currency_code: currency,
          value: amount.toFixed(2),
        },
      }],
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`PayPal create order error: ${JSON.stringify(data)}`);
  return data;
}


export async function captureOrder(env, paypalOrderId) {
  const token = await getAccessToken(env);

  const res = await fetch(`${PAYPAL_API}/v2/checkout/orders/${paypalOrderId}/capture`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`PayPal capture error: ${JSON.stringify(data)}`);
  return data;
}


export async function verifyWebhookSignature(env, headers, body) {
  const token = await getAccessToken(env);

  const res = await fetch(`${PAYPAL_API}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      auth_algo: headers.get('paypal-auth-algo'),
      cert_url: headers.get('paypal-cert-url'),
      transmission_id: headers.get('paypal-transmission-id'),
      transmission_sig: headers.get('paypal-transmission-sig'),
      transmission_time: headers.get('paypal-transmission-time'),
      webhook_id: env.PAYPAL_WEBHOOK_ID,
      webhook_event: JSON.parse(body),
    }),
  });

  const data = await res.json();
  if (data.verification_status !== 'SUCCESS') {
    throw new Error('Invalid PayPal webhook signature');
  }
  return JSON.parse(body);
}
