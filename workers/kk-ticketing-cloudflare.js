var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/supabase.js
function createSupabaseClient(env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY;
  async function query(table, { select = "*", filters = [], single = false, order, limit } = {}) {
    let endpoint = `${url}/rest/v1/${table}?select=${encodeURIComponent(select)}`;
    for (const f of filters) {
      endpoint += `&${f}`;
    }
    if (order)
      endpoint += `&order=${order}`;
    if (limit)
      endpoint += `&limit=${limit}`;
    const headers = {
      "apikey": key,
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json"
    };
    if (single)
      headers["Accept"] = "application/vnd.pgrst.object+json";
    const res = await fetch(endpoint, { headers });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Supabase query failed: ${res.status} ${err}`);
    }
    return res.json();
  }
  __name(query, "query");
  async function insert(table, data) {
    const res = await fetch(`${url}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        "apikey": key,
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Supabase insert failed: ${res.status} ${err}`);
    }
    return res.json();
  }
  __name(insert, "insert");
  async function update(table, filters, data) {
    let endpoint = `${url}/rest/v1/${table}`;
    if (filters.length)
      endpoint += `?${filters.join("&")}`;
    const res = await fetch(endpoint, {
      method: "PATCH",
      headers: {
        "apikey": key,
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Supabase update failed: ${res.status} ${err}`);
    }
    return res.json();
  }
  __name(update, "update");
  async function rpc(fn, params = {}) {
    const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        "apikey": key,
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(params)
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Supabase RPC failed: ${res.status} ${err}`);
    }
    return res.json();
  }
  __name(rpc, "rpc");
  return { query, insert, update, rpc };
}
__name(createSupabaseClient, "createSupabaseClient");

// src/stripe.js
async function createCheckoutSession(env, { orderNumber, eventTitle, amount, customerEmail, successUrl, cancelUrl, metadata }) {
  const params = new URLSearchParams();
  params.append("mode", "payment");
  params.append("customer_email", customerEmail);
  params.append("success_url", successUrl);
  params.append("cancel_url", cancelUrl);
  params.append("line_items[0][price_data][currency]", "eur");
  params.append("line_items[0][price_data][unit_amount]", Math.round(amount * 100).toString());
  params.append("line_items[0][price_data][product_data][name]", eventTitle);
  params.append("line_items[0][quantity]", "1");
  params.append("payment_intent_data[metadata][order_number]", orderNumber);
  params.append("payment_intent_data[metadata][order_id]", metadata.order_id);
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(`Stripe error: ${data.error?.message || res.status}`);
  return data;
}
__name(createCheckoutSession, "createCheckoutSession");
async function verifyWebhookSignature(secret, payload, sigHeader) {
  const parts = sigHeader.split(",").reduce((acc, part) => {
    const [k, v] = part.split("=");
    if (k === "t")
      acc.timestamp = v;
    if (k === "v1")
      acc.signatures.push(v);
    return acc;
  }, { timestamp: null, signatures: [] });
  if (!parts.timestamp || parts.signatures.length === 0) {
    throw new Error("Invalid Stripe signature header");
  }
  const now = Math.floor(Date.now() / 1e3);
  if (Math.abs(now - parseInt(parts.timestamp)) > 300) {
    throw new Error("Stripe webhook timestamp too old");
  }
  const signedPayload = `${parts.timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const computed = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const valid = parts.signatures.some((s) => s === computed);
  if (!valid)
    throw new Error("Invalid Stripe webhook signature");
  return JSON.parse(payload);
}
__name(verifyWebhookSignature, "verifyWebhookSignature");

// src/paypal.js
var PAYPAL_API = "https://api-m.sandbox.paypal.com";
async function getAccessToken(env) {
  const base = env.PAYPAL_ENVIRONMENT === "live" ? "https://api-m.paypal.com" : PAYPAL_API;
  const auth = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_SECRET}`);
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(`PayPal auth error: ${data.error_description || res.status}`);
  return data.access_token;
}
__name(getAccessToken, "getAccessToken");
function paypalBase(env) {
  return env.PAYPAL_ENVIRONMENT === "live" ? "https://api-m.paypal.com" : PAYPAL_API;
}
__name(paypalBase, "paypalBase");
async function createOrder(env, { orderNumber, eventTitle, amount }) {
  const token = await getAccessToken(env);
  const base = paypalBase(env);
  const res = await fetch(`${base}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{
        reference_id: orderNumber,
        description: eventTitle,
        amount: {
          currency_code: "EUR",
          value: amount.toFixed(2)
        }
      }]
    })
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(`PayPal create order error: ${JSON.stringify(data)}`);
  return data;
}
__name(createOrder, "createOrder");
async function captureOrder(env, paypalOrderId) {
  const token = await getAccessToken(env);
  const base = paypalBase(env);
  const res = await fetch(`${base}/v2/checkout/orders/${paypalOrderId}/capture`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(`PayPal capture error: ${JSON.stringify(data)}`);
  return data;
}
__name(captureOrder, "captureOrder");
async function verifyWebhookSignature2(env, headers, body) {
  const token = await getAccessToken(env);
  const base = paypalBase(env);
  const res = await fetch(`${base}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      auth_algo: headers.get("paypal-auth-algo"),
      cert_url: headers.get("paypal-cert-url"),
      transmission_id: headers.get("paypal-transmission-id"),
      transmission_sig: headers.get("paypal-transmission-sig"),
      transmission_time: headers.get("paypal-transmission-time"),
      webhook_id: env.PAYPAL_WEBHOOK_ID,
      webhook_event: JSON.parse(body)
    })
  });
  const data = await res.json();
  if (data.verification_status !== "SUCCESS") {
    throw new Error("Invalid PayPal webhook signature");
  }
  return JSON.parse(body);
}
__name(verifyWebhookSignature2, "verifyWebhookSignature");

// src/email.js
var DE_DAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
var DE_MONTHS = ["Januar", "Februar", "M\xE4rz", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
function formatDate(isoDate) {
  const d = new Date(isoDate);
  return `${DE_DAYS[d.getDay()]}, ${d.getDate()}. ${DE_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
__name(formatDate, "formatDate");
function formatTime(isoDate) {
  const d = new Date(isoDate);
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}
__name(formatTime, "formatTime");
function formatEuro(amount) {
  return parseFloat(amount).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}
__name(formatEuro, "formatEuro");
async function sendConfirmationEmail(env, { order, event }) {
  if (!env.RESEND_API_KEY) {
    console.log("RESEND_API_KEY nicht gesetzt – E-Mail übersprungen");
    return;
  }
  const fromEmail = env.EMAIL_FROM || "tickets@kneipenkoenig.de";
  const paymentLabels = { stripe: "Kreditkarte", paypal: "PayPal", bar: "Barzahlung vor Ort", free: "Kostenlos" };
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#0a0a1a;font-family:'Helvetica Neue',Arial,sans-serif;color:#fff;">
<div style="max-width:560px;margin:0 auto;padding:40px 20px;">
<div style="text-align:center;margin-bottom:32px;">
<div style="font-size:24px;font-weight:800;letter-spacing:-0.5px;"><span style="color:#fff;">DER</span><span style="color:#38b6ff;">KNEIPENKÖNIG</span></div>
</div>
<div style="background:rgba(52,211,153,0.1);border:1px solid rgba(52,211,153,0.3);border-radius:16px;padding:24px;text-align:center;margin-bottom:24px;">
<div style="font-size:40px;margin-bottom:8px;">✓</div>
<div style="font-size:22px;font-weight:700;">Buchung bestätigt!</div>
<div style="color:rgba(255,255,255,0.6);margin-top:4px;">Bestellnummer: <strong style="color:#38b6ff;">${order.order_number}</strong></div>
</div>
<div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:24px;margin-bottom:24px;">
<div style="font-size:18px;font-weight:700;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.1);">${event.title}</div>
<table style="width:100%;border-collapse:collapse;">
<tr><td style="padding:8px 0;color:rgba(255,255,255,0.5);font-size:14px;">Datum</td><td style="padding:8px 0;text-align:right;font-weight:600;font-size:14px;">${formatDate(event.start_date)} · ${formatTime(event.start_date)} Uhr</td></tr>
<tr><td style="padding:8px 0;color:rgba(255,255,255,0.5);font-size:14px;">Location</td><td style="padding:8px 0;text-align:right;font-weight:600;font-size:14px;">${event.venue_name || "–"}${event.venue_address ? '<br><span style="font-weight:400;color:rgba(255,255,255,0.5);font-size:12px;">' + event.venue_address + '</span>' : ''}</td></tr>
${order.team_name ? '<tr><td style="padding:8px 0;color:rgba(255,255,255,0.5);font-size:14px;">Team</td><td style="padding:8px 0;text-align:right;font-weight:600;font-size:14px;color:#38b6ff;">' + order.team_name + '</td></tr>' : ''}
<tr><td style="padding:8px 0;color:rgba(255,255,255,0.5);font-size:14px;">Tickets</td><td style="padding:8px 0;text-align:right;font-weight:600;font-size:14px;">${order.quantity}×</td></tr>
<tr><td style="padding:8px 0;color:rgba(255,255,255,0.5);font-size:14px;">Betrag</td><td style="padding:8px 0;text-align:right;font-weight:600;font-size:14px;">${formatEuro(order.total_amount)}</td></tr>
<tr><td style="padding:8px 0;color:rgba(255,255,255,0.5);font-size:14px;">Zahlung</td><td style="padding:8px 0;text-align:right;font-weight:600;font-size:14px;">${paymentLabels[order.payment_method] || order.payment_method}</td></tr>
</table>
</div>
${order.payment_method === 'bar' ? '<div style="background:rgba(234,179,8,0.1);border:1px solid rgba(234,179,8,0.3);border-radius:12px;padding:16px;margin-bottom:24px;font-size:14px;color:rgba(255,255,255,0.7);"><strong style="color:#eab308;">💶 Barzahlung</strong><br>Bitte bezahle den Betrag vor Ort bei der Anmeldung.</div>' : ''}
<div style="text-align:center;margin-bottom:32px;">
<a href="https://kneipenkoenig.de/buchung-bestaetigt.html?order=${order.order_number}" style="display:inline-block;background:#38b6ff;color:#000;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;text-decoration:none;">Buchung anzeigen & QR-Code</a>
</div>
<div style="text-align:center;color:rgba(255,255,255,0.3);font-size:12px;padding-top:24px;border-top:1px solid rgba(255,255,255,0.08);">
<p>Der Kneipenkönig · Lettevents · Michael Schülke</p>
<p>Nikolaus-Groß-Str. 27, 48653 Coesfeld</p>
<p style="margin-top:8px;"><a href="https://kneipenkoenig.de" style="color:#38b6ff;text-decoration:none;">kneipenkoenig.de</a> · <a href="https://www.instagram.com/derkneipenkoenig/" style="color:#38b6ff;text-decoration:none;">Instagram</a></p>
</div>
</div>
</body></html>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: `Der Kneipenkönig <${fromEmail}>`,
        reply_to: "info@kneipenkoenig.de",
        to: [order.customer_email],
        subject: `Buchung bestätigt: ${event.title} – ${order.order_number}`,
        html
      })
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("Resend error:", err);
    } else {
      console.log(`Confirmation email sent to ${order.customer_email}`);
    }
  } catch (err) {
    console.error("Email send failed:", err);
  }
}
__name(sendConfirmationEmail, "sendConfirmationEmail");
async function sendWaitlistNotification(env, { email, name, event }) {
  if (!env.RESEND_API_KEY) return;
  const fromEmail = env.EMAIL_FROM || "tickets@kneipenkoenig.de";
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#0a0a1a;font-family:'Helvetica Neue',Arial,sans-serif;color:#fff;">
<div style="max-width:560px;margin:0 auto;padding:40px 20px;">
<div style="text-align:center;margin-bottom:32px;"><div style="font-size:24px;font-weight:800;"><span style="color:#fff;">DER</span><span style="color:#38b6ff;">KNEIPENKÖNIG</span></div></div>
<div style="background:rgba(56,182,255,0.1);border:1px solid rgba(56,182,255,0.3);border-radius:16px;padding:24px;text-align:center;margin-bottom:24px;">
<div style="font-size:40px;margin-bottom:8px;">🎉</div>
<div style="font-size:20px;font-weight:700;">Platz frei geworden!</div>
<div style="color:rgba(255,255,255,0.6);margin-top:8px;font-size:15px;">Hallo ${name}, für <strong>${event.title}</strong> ist wieder ein Platz verfügbar!</div>
</div>
<div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:20px;margin-bottom:24px;text-align:center;">
<div style="font-weight:600;margin-bottom:4px;">${event.title}</div>
<div style="color:rgba(255,255,255,0.5);font-size:14px;">${formatDate(event.start_date)} · ${formatTime(event.start_date)} Uhr</div>
${event.venue_name ? '<div style="color:rgba(255,255,255,0.5);font-size:14px;">' + event.venue_name + '</div>' : ''}
</div>
<div style="text-align:center;margin-bottom:32px;"><a href="https://kneipenkoenig.de/#events" style="display:inline-block;background:#38b6ff;color:#000;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;text-decoration:none;">Jetzt Ticket sichern →</a></div>
<div style="text-align:center;color:rgba(255,255,255,0.3);font-size:12px;padding-top:24px;border-top:1px solid rgba(255,255,255,0.08);"><p>Der Kneipenkönig · Lettevents</p><p><a href="https://kneipenkoenig.de" style="color:#38b6ff;text-decoration:none;">kneipenkoenig.de</a></p></div>
</div></body></html>`;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `Der Kneipenkönig <${fromEmail}>`,
        reply_to: "info@kneipenkoenig.de",
        to: [email],
        subject: `Platz frei: ${event.title} – Jetzt buchen!`,
        html
      })
    });
  } catch (err) {
    console.error("Waitlist notification failed:", err);
  }
}
__name(sendWaitlistNotification, "sendWaitlistNotification");

// src/index.js
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
__name(json, "json");
function cors(response, origin) {
  response.headers.set("Access-Control-Allow-Origin", origin || "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return response;
}
__name(cors, "cors");
function match(pathname, pattern) {
  const patParts = pattern.split("/");
  const urlParts = pathname.split("/");
  if (patParts.length !== urlParts.length) return null;
  const params = {};
  for (let i = 0; i < patParts.length; i++) {
    if (patParts[i].startsWith(":")) {
      params[patParts[i].slice(1)] = urlParts[i];
    } else if (patParts[i] !== urlParts[i]) {
      return null;
    }
  }
  return params;
}
__name(match, "match");
var src_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const origin = request.headers.get("Origin") || env.CORS_ORIGIN;
    if (request.method === "OPTIONS") {
      return cors(new Response(null, { status: 204 }), origin);
    }
    try {
      let response;
      if (request.method === "GET" && match(pathname, "/availability/:id")) {
        const { id } = match(pathname, "/availability/:id");
        response = await handleAvailability(env, id);
      } else if (request.method === "POST" && pathname === "/checkout") {
        response = await handleCheckout(env, request);
      } else if (request.method === "POST" && pathname === "/checkout/paypal-capture") {
        response = await handlePayPalCapture(env, request);
      } else if (request.method === "POST" && pathname === "/validate-discount") {
        response = await handleValidateDiscount(env, request);
      } else if (request.method === "POST" && pathname === "/webhook/stripe") {
        response = await handleStripeWebhook(env, request);
      } else if (request.method === "POST" && pathname === "/webhook/paypal") {
        response = await handlePayPalWebhook(env, request);
      } else {
        response = json({ error: "Not found" }, 404);
      }
      return cors(response, origin);
    } catch (err) {
      console.error("Worker error:", err);
      return cors(json({ error: err.message }, 500), origin);
    }
  }
};

// ── AVAILABILITY ──
async function handleAvailability(env, eventId) {
  const db = createSupabaseClient(env);
  const event = await db.query("events", {
    select: "id,title,description,venue_name,venue_address,start_date,end_date,status,allow_cash,image_url",
    filters: [`id=eq.${eventId}`],
    single: true
  });
  if (!event || event.status !== "published") {
    return json({ error: "Event nicht gefunden" }, 404);
  }
  const ticketTypes = await db.rpc("get_event_availability", { p_event_id: eventId });
  const soldOut = ticketTypes.every((tt) => tt.available === 0);
  return json({
    event,
    ticket_types: ticketTypes,
    sold_out: soldOut
  });
}
__name(handleAvailability, "handleAvailability");

// ── VALIDATE DISCOUNT ──
async function handleValidateDiscount(env, request) {
  const { code, event_id } = await request.json();
  if (!code) return json({ error: "Code fehlt" }, 400);
  const db = createSupabaseClient(env);
  const now = new Date().toISOString();
  const codes = await db.query("discount_codes", {
    filters: [`code=eq.${code.toUpperCase()}`, "active=eq.true"]
  });
  if (!codes.length) {
    return json({ valid: false, reason: "Ungültiger Code" });
  }
  const dc = codes[0];
  if (dc.valid_from && now < dc.valid_from) {
    return json({ valid: false, reason: "Code noch nicht gültig" });
  }
  if (dc.valid_until && now > dc.valid_until) {
    return json({ valid: false, reason: "Code abgelaufen" });
  }
  if (dc.max_uses && dc.used_count >= dc.max_uses) {
    return json({ valid: false, reason: "Code bereits aufgebraucht" });
  }
  if (dc.event_id && dc.event_id !== event_id) {
    return json({ valid: false, reason: "Code gilt nicht für dieses Event" });
  }
  return json({
    valid: true,
    type: dc.type,
    value: parseFloat(dc.value),
    discount_id: dc.id
  });
}
__name(handleValidateDiscount, "handleValidateDiscount");

// ── CHECKOUT ──
async function handleCheckout(env, request) {
  const body = await request.json();
  const { event_id, ticket_type_id, quantity, customer_name, customer_email, customer_phone, team_name, player_names, payment_method, discount_code, checkout_data, success_url, cancel_url } = body;
  if (!event_id || !ticket_type_id || !customer_name || !customer_email || !payment_method) {
    return json({ error: "Pflichtfelder fehlen (event_id, ticket_type_id, customer_name, customer_email, payment_method)" }, 400);
  }
  if (!["stripe", "paypal", "free", "bar"].includes(payment_method)) {
    return json({ error: "Ungültige Zahlungsmethode" }, 400);
  }
  const db = createSupabaseClient(env);

  // 1. Event laden
  const event = await db.query("events", {
    select: "id,title,status,allow_cash,start_date,venue_name,venue_address",
    filters: [`id=eq.${event_id}`],
    single: true
  });
  if (!event || event.status !== "published") {
    return json({ error: "Event nicht verfügbar" }, 400);
  }
  if (payment_method === "bar" && !event.allow_cash) {
    return json({ error: "Barzahlung ist für dieses Event nicht erlaubt" }, 400);
  }

  // 2. Ticket-Typ laden
  const qty = quantity || 1;
  const types = await db.query("ticket_types", {
    filters: [`id=eq.${ticket_type_id}`, `event_id=eq.${event_id}`]
  });
  if (!types.length) {
    return json({ error: "Ticket-Typ nicht gefunden" }, 400);
  }
  const ticketType = types[0];
  const ticketPrice = parseFloat(ticketType.price);

  // 3. Verfügbarkeit prüfen
  const availability = await db.rpc("get_event_availability", { p_event_id: event_id });
  const ttAvail = availability.find((a) => a.ticket_type_id === ticket_type_id);
  if (ttAvail && ttAvail.available < qty) {
    return json({ error: "Nicht genügend Tickets verfügbar", available: ttAvail.available }, 400);
  }

  // 4. Rabattcode prüfen
  let totalAmount = ticketPrice * qty;
  let discountId = null;
  let discountAmount = 0;
  if (discount_code) {
    const codes = await db.query("discount_codes", {
      filters: [`code=eq.${discount_code.toUpperCase()}`, "active=eq.true"]
    });
    if (codes.length) {
      const dc = codes[0];
      const now = new Date().toISOString();
      const valid = (!dc.valid_from || now >= dc.valid_from) && (!dc.valid_until || now <= dc.valid_until) && (!dc.max_uses || dc.used_count < dc.max_uses) && (!dc.event_id || dc.event_id === event_id);
      if (valid) {
        discountId = dc.id;
        if (dc.type === "percent") {
          discountAmount = Math.round((totalAmount * parseFloat(dc.value) / 100) * 100) / 100;
        } else {
          discountAmount = Math.min(parseFloat(dc.value), totalAmount);
        }
        totalAmount = Math.max(0, Math.round((totalAmount - discountAmount) * 100) / 100);
      }
    }
  }

  // 5. Bestellnummer generieren
  const orderNumber = await db.rpc("next_order_number");

  // 6. Effektive Zahlungsmethode
  const effectiveMethod = totalAmount === 0 ? "free" : payment_method;
  const paymentStatus = effectiveMethod === "free" ? "paid" : "pending";

  // 7. Bestellung anlegen
  const [order] = await db.insert("orders", {
    event_id,
    ticket_type_id,
    order_number: orderNumber,
    customer_name,
    customer_email,
    customer_phone: customer_phone || null,
    team_name: team_name || null,
    player_names: player_names || [],
    quantity: qty,
    total_amount: totalAmount,
    discount_code: discount_code ? discount_code.toUpperCase() : null,
    discount_amount: discountAmount,
    payment_method: effectiveMethod,
    payment_status: paymentStatus,
    checkout_data: checkout_data || {},
    email_sent: false
  });

  // 8. Rabattcode-Nutzung erhöhen
  if (discountId) {
    const dcData = await db.query("discount_codes", { select: "used_count", filters: [`id=eq.${discountId}`], single: true });
    await db.update("discount_codes", [`id=eq.${discountId}`], { used_count: dcData.used_count + 1 });
  }

  // 9. Zahlungsmethode verarbeiten
  if (effectiveMethod === "free") {
    await sendConfirmationEmail(env, { order: { ...order, order_number: orderNumber, total_amount: 0, payment_method: "free" }, event });
    return json({ success: true, order_number: orderNumber, order_id: order.id, qr_code: order.qr_code, total_amount: 0, payment_method: "free", message: "Kostenlose Buchung bestätigt" });
  }
  if (effectiveMethod === "bar") {
    await sendConfirmationEmail(env, { order: { ...order, order_number: orderNumber, total_amount: totalAmount, payment_method: "bar" }, event });
    return json({ success: true, order_number: orderNumber, order_id: order.id, qr_code: order.qr_code, total_amount: totalAmount, payment_method: "bar", message: "Buchung bestätigt – Bezahlung vor Ort" });
  }
  if (effectiveMethod === "stripe") {
    const session = await createCheckoutSession(env, {
      orderNumber,
      eventTitle: `${event.title} – ${team_name || customer_name}`,
      amount: totalAmount,
      customerEmail: customer_email,
      successUrl: success_url || `https://kneipenkoenig.de/buchung-bestaetigt.html?order=${orderNumber}`,
      cancelUrl: cancel_url || `https://kneipenkoenig.de/index.html#events`,
      metadata: { order_id: order.id }
    });
    return json({ success: true, order_number: orderNumber, order_id: order.id, total_amount: totalAmount, payment_method: "stripe", checkout_url: session.url });
  }
  if (effectiveMethod === "paypal") {
    const ppOrder = await createOrder(env, {
      orderNumber,
      eventTitle: `${event.title} – ${team_name || customer_name}`,
      amount: totalAmount
    });
    await db.update("orders", [`id=eq.${order.id}`], { payment_id: ppOrder.id });
    return json({ success: true, order_number: orderNumber, order_id: order.id, total_amount: totalAmount, payment_method: "paypal", paypal_order_id: ppOrder.id });
  }
  return json({ error: "Ungültige Zahlungsmethode" }, 400);
}
__name(handleCheckout, "handleCheckout");

// ── PAYPAL CAPTURE ──
async function handlePayPalCapture(env, request) {
  const { paypal_order_id } = await request.json();
  if (!paypal_order_id) return json({ error: "paypal_order_id fehlt" }, 400);
  const db = createSupabaseClient(env);
  const capture = await captureOrder(env, paypal_order_id);
  if (capture.status === "COMPLETED") {
    const orders = await db.update("orders", [`payment_id=eq.${paypal_order_id}`], { payment_status: "paid" });
    if (orders.length) {
      const o = orders[0];
      try {
        const ev = await db.query("events", { filters: [`id=eq.${o.event_id}`], single: true });
        await sendConfirmationEmail(env, { order: o, event: ev });
      } catch {}
      return json({ success: true, order_number: o.order_number, order_id: o.id, qr_code: o.qr_code, message: "Zahlung erfolgreich" });
    }
  }
  return json({ error: "PayPal Zahlung fehlgeschlagen", details: capture }, 400);
}
__name(handlePayPalCapture, "handlePayPalCapture");

// ── STRIPE WEBHOOK ──
async function handleStripeWebhook(env, request) {
  const payload = await request.text();
  const sig = request.headers.get("stripe-signature");
  if (!sig) return json({ error: "Missing signature" }, 400);
  const event = await verifyWebhookSignature(env.STRIPE_WEBHOOK_SECRET, payload, sig);
  const db = createSupabaseClient(env);
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const orderId = session.metadata?.order_id;
      const orderNumber = session.metadata?.order_number;
      const paymentId = session.payment_intent;
      if (orderId) {
        const updatedOrders = await db.update("orders", [`id=eq.${orderId}`], { payment_status: "paid", payment_id: paymentId });
        if (updatedOrders.length) {
          const o = updatedOrders[0];
          try {
            const ev = await db.query("events", { filters: [`id=eq.${o.event_id}`], single: true });
            await sendConfirmationEmail(env, { order: o, event: ev });
          } catch {}
        }
      } else if (orderNumber) {
        const updatedOrders = await db.update("orders", [`order_number=eq.${orderNumber}`], { payment_status: "paid", payment_id: paymentId });
        if (updatedOrders.length) {
          const o = updatedOrders[0];
          try {
            const ev = await db.query("events", { filters: [`id=eq.${o.event_id}`], single: true });
            await sendConfirmationEmail(env, { order: o, event: ev });
          } catch {}
        }
      }
      break;
    }
    case "charge.refunded": {
      const charge = event.data.object;
      const paymentId = charge.payment_intent;
      if (paymentId) {
        const orders = await db.query("orders", { filters: [`payment_id=eq.${paymentId}`] });
        if (orders.length) {
          await db.update("orders", [`payment_id=eq.${paymentId}`], { payment_status: "refunded" });
          await notifyWaitlist(env, db, orders[0].event_id);
        }
      }
      break;
    }
  }
  return json({ received: true });
}
__name(handleStripeWebhook, "handleStripeWebhook");

// ── PAYPAL WEBHOOK ──
async function handlePayPalWebhook(env, request) {
  const body = await request.text();
  const event = await verifyWebhookSignature2(env, request.headers, body);
  const db = createSupabaseClient(env);
  switch (event.event_type) {
    case "PAYMENT.CAPTURE.COMPLETED": {
      const orderId = event.resource?.supplementary_data?.related_ids?.order_id;
      if (orderId) {
        await db.update("orders", [`payment_id=eq.${orderId}`], { payment_status: "paid" });
      }
      break;
    }
    case "PAYMENT.CAPTURE.REFUNDED": {
      const orderId = event.resource?.supplementary_data?.related_ids?.order_id;
      if (orderId) {
        const orders = await db.query("orders", { filters: [`payment_id=eq.${orderId}`] });
        if (orders.length) {
          await db.update("orders", [`payment_id=eq.${orderId}`], { payment_status: "refunded" });
          await notifyWaitlist(env, db, orders[0].event_id);
        }
      }
      break;
    }
  }
  return json({ received: true });
}
__name(handlePayPalWebhook, "handlePayPalWebhook");

// ── WAITLIST NOTIFICATION ──
async function notifyWaitlist(env, db, eventId) {
  const availability = await db.rpc("get_event_availability", { p_event_id: eventId });
  const totalAvailable = availability.reduce((sum, tt) => sum + tt.available, 0);
  if (totalAvailable <= 0) return;
  const waiters = await db.query("waitlist", {
    filters: [`event_id=eq.${eventId}`, "notified=eq.false"],
    order: "created_at.asc",
    limit: 1
  });
  if (waiters.length) {
    await db.update("waitlist", [`id=eq.${waiters[0].id}`], { notified: true });
    try {
      const event = await db.query("events", { filters: [`id=eq.${eventId}`], single: true });
      await sendWaitlistNotification(env, { email: waiters[0].email, name: waiters[0].name, event });
    } catch {}
  }
}
__name(notifyWaitlist, "notifyWaitlist");

export { src_default as default };
