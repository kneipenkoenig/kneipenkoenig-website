import { createSupabaseClient } from './supabase.js';
import { createCheckoutSession, verifyWebhookSignature as verifyStripe } from './stripe.js';
import { createOrder as createPayPalOrder, captureOrder as capturePayPal, verifyWebhookSignature as verifyPayPal } from './paypal.js';
import { sendConfirmationEmail, sendWaitlistNotification } from './email.js';

// ── Helpers ──────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function cors(response, origin) {
  response.headers.set('Access-Control-Allow-Origin', origin || '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return response;
}

function match(pathname, pattern) {
  // Einfacher Pattern-Match: /availability/:id → { id: '...' }
  const patParts = pattern.split('/');
  const urlParts = pathname.split('/');
  if (patParts.length !== urlParts.length) return null;
  const params = {};
  for (let i = 0; i < patParts.length; i++) {
    if (patParts[i].startsWith(':')) {
      params[patParts[i].slice(1)] = urlParts[i];
    } else if (patParts[i] !== urlParts[i]) {
      return null;
    }
  }
  return params;
}

// ── Main Worker ──────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const origin = request.headers.get('Origin') || env.CORS_ORIGIN;

    // CORS Preflight
    if (request.method === 'OPTIONS') {
      return cors(new Response(null, { status: 204 }), origin);
    }

    try {
      let response;

      // ── Routes ──
      if (request.method === 'GET' && match(pathname, '/availability/:id')) {
        const { id } = match(pathname, '/availability/:id');
        response = await handleAvailability(env, id);

      } else if (request.method === 'POST' && pathname === '/checkout') {
        response = await handleCheckout(env, request);

      } else if (request.method === 'POST' && pathname === '/checkout/paypal-capture') {
        response = await handlePayPalCapture(env, request);

      } else if (request.method === 'POST' && pathname === '/validate-discount') {
        response = await handleValidateDiscount(env, request);

      } else if (request.method === 'POST' && pathname === '/webhook/stripe') {
        response = await handleStripeWebhook(env, request);

      } else if (request.method === 'POST' && pathname === '/webhook/paypal') {
        response = await handlePayPalWebhook(env, request);

      } else {
        response = json({ error: 'Not found' }, 404);
      }

      return cors(response, origin);

    } catch (err) {
      console.error('Worker error:', err);
      return cors(json({ error: err.message }, 500), origin);
    }
  },
};


// ── GET /availability/:id ────────────────────────────────

async function handleAvailability(env, eventId) {
  const db = createSupabaseClient(env);

  const event = await db.query('events', {
    select: 'id,title,max_tickets,status,start_date',
    filters: [`id=eq.${eventId}`],
    single: true,
  });

  if (!event || event.status !== 'published') {
    return json({ error: 'Event nicht gefunden' }, 404);
  }

  const available = await db.rpc('available_tickets', { p_event_id: eventId });

  return json({
    event_id: event.id,
    title: event.title,
    max_tickets: event.max_tickets,
    available,
    sold_out: available === 0,
    start_date: event.start_date,
  });
}


// ── POST /validate-discount ──────────────────────────────

async function handleValidateDiscount(env, request) {
  const { code, event_id } = await request.json();
  if (!code) return json({ error: 'Code fehlt' }, 400);

  const db = createSupabaseClient(env);
  const now = new Date().toISOString();

  // Code suchen
  const codes = await db.query('discount_codes', {
    filters: [`code=eq.${code}`, 'active=eq.true'],
  });

  if (!codes.length) {
    return json({ valid: false, reason: 'Ungültiger Code' });
  }

  const dc = codes[0];

  // Gültigkeitszeitraum prüfen
  if (dc.valid_from && now < dc.valid_from) {
    return json({ valid: false, reason: 'Code noch nicht gültig' });
  }
  if (dc.valid_until && now > dc.valid_until) {
    return json({ valid: false, reason: 'Code abgelaufen' });
  }

  // Max Nutzungen prüfen
  if (dc.max_uses && dc.used_count >= dc.max_uses) {
    return json({ valid: false, reason: 'Code bereits aufgebraucht' });
  }

  // Event-Bindung prüfen
  if (dc.event_id && dc.event_id !== event_id) {
    return json({ valid: false, reason: 'Code gilt nicht für dieses Event' });
  }

  return json({
    valid: true,
    type: dc.type,
    value: parseFloat(dc.value),
    discount_id: dc.id,
  });
}


// ── POST /checkout ───────────────────────────────────────

async function handleCheckout(env, request) {
  const body = await request.json();
  const { event_id, ticket_type_id, quantity, customer_name, customer_email, customer_phone, team_name, payment_method, discount_code, checkout_data, success_url, cancel_url } = body;

  // Pflichtfelder prüfen
  if (!event_id || !customer_name || !customer_email || !payment_method) {
    return json({ error: 'Pflichtfelder fehlen (event_id, customer_name, customer_email, payment_method)' }, 400);
  }

  const db = createSupabaseClient(env);

  // Event laden
  const event = await db.query('events', {
    select: 'id,title,status,max_tickets,price,currency',
    filters: [`id=eq.${event_id}`],
    single: true,
  });

  if (!event || event.status !== 'published') {
    return json({ error: 'Event nicht verfügbar' }, 400);
  }

  // Verfügbarkeit prüfen
  const available = await db.rpc('available_tickets', { p_event_id: event_id });
  const qty = quantity || 1;
  if (available < qty) {
    return json({ error: 'Nicht genügend Tickets verfügbar', available }, 400);
  }

  // Preis berechnen
  let ticketPrice = parseFloat(event.price);

  // Ticket-Typ laden (falls angegeben)
  if (ticket_type_id) {
    const types = await db.query('ticket_types', {
      filters: [`id=eq.${ticket_type_id}`, `event_id=eq.${event_id}`],
    });
    if (types.length) ticketPrice = parseFloat(types[0].price);
  }

  let totalAmount = ticketPrice * qty;
  let discountId = null;

  // Rabattcode anwenden
  if (discount_code) {
    const codes = await db.query('discount_codes', {
      filters: [`code=eq.${discount_code}`, 'active=eq.true'],
    });

    if (codes.length) {
      const dc = codes[0];
      const now = new Date().toISOString();
      const valid = (!dc.valid_from || now >= dc.valid_from)
        && (!dc.valid_until || now <= dc.valid_until)
        && (!dc.max_uses || dc.used_count < dc.max_uses)
        && (!dc.event_id || dc.event_id === event_id);

      if (valid) {
        discountId = dc.id;
        if (dc.type === 'percent') {
          totalAmount *= (1 - parseFloat(dc.value) / 100);
        } else {
          totalAmount = Math.max(0, totalAmount - parseFloat(dc.value));
        }
        totalAmount = Math.round(totalAmount * 100) / 100;
      }
    }
  }

  // Bestellnummer generieren
  const orderNumber = await db.rpc('next_order_number');

  // Order anlegen
  const paymentStatus = (totalAmount === 0 || payment_method === 'bar') ? 'paid' : 'pending';
  const [order] = await db.insert('orders', {
    event_id,
    order_number: orderNumber,
    customer_name,
    customer_email,
    customer_phone: customer_phone || null,
    team_name: team_name || null,
    ticket_type_id: ticket_type_id || null,
    quantity: qty,
    total_amount: totalAmount,
    payment_method,
    payment_status: totalAmount === 0 ? 'paid' : (payment_method === 'bar' ? 'pending' : 'pending'),
    checkout_data: checkout_data || {},
  });

  // Rabattcode-Nutzung hochzählen
  if (discountId) {
    await db.update('discount_codes', [`id=eq.${discountId}`], {
      used_count: (await db.query('discount_codes', { select: 'used_count', filters: [`id=eq.${discountId}`], single: true })).used_count + 1,
    });
  }

  // Kostenlose oder Barzahlung → direkt bestätigt + E-Mail
  if (totalAmount === 0) {
    await db.update('orders', [`id=eq.${order.id}`], { payment_status: 'paid' });
    await sendConfirmationEmail(env, { order: { ...order, order_number: orderNumber, total_amount: 0, payment_method: 'free' }, event });
    return json({
      success: true,
      order_number: orderNumber,
      order_id: order.id,
      total_amount: 0,
      payment_method: 'free',
      message: 'Kostenlose Buchung bestätigt',
    });
  }

  if (payment_method === 'bar') {
    await sendConfirmationEmail(env, { order: { ...order, order_number: orderNumber, total_amount: totalAmount, payment_method: 'bar' }, event });
    return json({
      success: true,
      order_number: orderNumber,
      order_id: order.id,
      total_amount: totalAmount,
      payment_method: 'bar',
      message: 'Buchung bestätigt – Bezahlung vor Ort',
    });
  }

  // Stripe Checkout
  if (payment_method === 'stripe') {
    const session = await createCheckoutSession(env, {
      orderNumber,
      eventTitle: `${event.title} – ${team_name || customer_name}`,
      amount: totalAmount,
      currency: event.currency,
      customerEmail: customer_email,
      successUrl: success_url || `https://kneipenkoenig.de/buchung-bestaetigt.html?order=${orderNumber}`,
      cancelUrl: cancel_url || `https://kneipenkoenig.de/index.html#events`,
      metadata: { order_id: order.id },
    });

    return json({
      success: true,
      order_number: orderNumber,
      order_id: order.id,
      total_amount: totalAmount,
      payment_method: 'stripe',
      checkout_url: session.url,
    });
  }

  // PayPal
  if (payment_method === 'paypal') {
    const ppOrder = await createPayPalOrder(env, {
      orderNumber,
      eventTitle: `${event.title} – ${team_name || customer_name}`,
      amount: totalAmount,
      currency: event.currency,
    });

    // PayPal Order-ID in unserer DB speichern
    await db.update('orders', [`id=eq.${order.id}`], { payment_id: ppOrder.id });

    return json({
      success: true,
      order_number: orderNumber,
      order_id: order.id,
      total_amount: totalAmount,
      payment_method: 'paypal',
      paypal_order_id: ppOrder.id,
    });
  }

  return json({ error: 'Ungültige Zahlungsmethode' }, 400);
}


// ── POST /checkout/paypal-capture ────────────────────────
// Wird vom Frontend aufgerufen nachdem PayPal-Button bestätigt

async function handlePayPalCapture(env, request) {
  const { paypal_order_id } = await request.json();
  if (!paypal_order_id) return json({ error: 'paypal_order_id fehlt' }, 400);

  const db = createSupabaseClient(env);

  // Zahlung bei PayPal abschließen
  const capture = await capturePayPal(env, paypal_order_id);

  if (capture.status === 'COMPLETED') {
    // Order in DB als bezahlt markieren
    const orders = await db.update('orders', [`payment_id=eq.${paypal_order_id}`], {
      payment_status: 'paid',
    });

    if (orders.length) {
      const o = orders[0];
      try {
        const ev = await db.query('events', { filters: [`id=eq.${o.event_id}`], single: true });
        await sendConfirmationEmail(env, { order: o, event: ev });
      } catch { /* E-Mail-Fehler nicht kritisch */ }
      return json({
        success: true,
        order_number: o.order_number,
        order_id: o.id,
        message: 'Zahlung erfolgreich',
      });
    }
  }

  return json({ error: 'PayPal Zahlung fehlgeschlagen', details: capture }, 400);
}


// ── POST /webhook/stripe ─────────────────────────────────

async function handleStripeWebhook(env, request) {
  const payload = await request.text();
  const sig = request.headers.get('stripe-signature');

  if (!sig) return json({ error: 'Missing signature' }, 400);

  const event = await verifyStripe(env.STRIPE_WEBHOOK_SECRET, payload, sig);

  const db = createSupabaseClient(env);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const orderNumber = session.payment_intent?.metadata?.order_number
        || session.metadata?.order_number;
      const paymentId = session.payment_intent;

      if (orderNumber) {
        const updatedOrders = await db.update('orders', [`order_number=eq.${orderNumber}`], {
          payment_status: 'paid',
          payment_id: paymentId,
        });
        // Bestätigungs-E-Mail senden
        if (updatedOrders.length) {
          const o = updatedOrders[0];
          try {
            const ev = await db.query('events', { filters: [`id=eq.${o.event_id}`], single: true });
            await sendConfirmationEmail(env, { order: o, event: ev });
          } catch { /* E-Mail-Fehler nicht kritisch */ }
        }
      }
      break;
    }

    case 'charge.refunded': {
      const charge = event.data.object;
      const paymentId = charge.payment_intent;
      if (paymentId) {
        const orders = await db.query('orders', {
          filters: [`payment_id=eq.${paymentId}`],
        });
        if (orders.length) {
          await db.update('orders', [`payment_id=eq.${paymentId}`], {
            payment_status: 'refunded',
          });
          // Warteliste benachrichtigen
          await notifyWaitlist(env, db, orders[0].event_id);
        }
      }
      break;
    }
  }

  return json({ received: true });
}


// ── POST /webhook/paypal ─────────────────────────────────

async function handlePayPalWebhook(env, request) {
  const body = await request.text();

  const event = await verifyPayPal(env, request.headers, body);

  const db = createSupabaseClient(env);

  switch (event.event_type) {
    case 'PAYMENT.CAPTURE.COMPLETED': {
      const orderId = event.resource?.supplementary_data?.related_ids?.order_id;
      if (orderId) {
        await db.update('orders', [`payment_id=eq.${orderId}`], {
          payment_status: 'paid',
        });
      }
      break;
    }

    case 'PAYMENT.CAPTURE.REFUNDED': {
      const orderId = event.resource?.supplementary_data?.related_ids?.order_id;
      if (orderId) {
        const orders = await db.query('orders', {
          filters: [`payment_id=eq.${orderId}`],
        });
        if (orders.length) {
          await db.update('orders', [`payment_id=eq.${orderId}`], {
            payment_status: 'refunded',
          });
          await notifyWaitlist(env, db, orders[0].event_id);
        }
      }
      break;
    }
  }

  return json({ received: true });
}


// ── Warteliste benachrichtigen ───────────────────────────

async function notifyWaitlist(env, db, eventId) {
  const available = await db.rpc('available_tickets', { p_event_id: eventId });
  if (available <= 0) return;

  const waiters = await db.query('waitlist', {
    filters: [`event_id=eq.${eventId}`, 'notified=eq.false'],
    order: 'created_at.asc',
    limit: 1,
  });

  if (waiters.length) {
    await db.update('waitlist', [`id=eq.${waiters[0].id}`], { notified: true });
    try {
      const event = await db.query('events', { filters: [`id=eq.${eventId}`], single: true });
      await sendWaitlistNotification(env, { email: waiters[0].email, name: waiters[0].name, event });
    } catch { /* nicht kritisch */ }
  }
}
