// Offline characterization probes. Never calls a real backend or payment provider.
// These assertions document current defects, not desired production behavior.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
const root = new URL('../../', import.meta.url);
const env = { SUPABASE_URL: 'https://db.invalid', SUPABASE_SERVICE_KEY: 'fake', STRIPE_WEBHOOK_SECRET: 'offline-only' };
const reply = x => new Response(JSON.stringify(x), { headers: { 'Content-Type': 'application/json' } });
const originalFetch = globalThis.fetch;
const results = [];
async function load(path) {
  return (await import('data:text/javascript;base64,' + Buffer.from(await readFile(new URL(path, root), 'utf8')).toString('base64'))).default;
}
function fixture() {
  const orders = []; let seq = 0; let patches = 0;
  globalThis.fetch = async (input, init = {}) => {
    const u = new URL(input);
    assert.equal(u.hostname, 'db.invalid', 'Unexpected outbound destination blocked');
    const p = u.pathname;
    if (p.endsWith('/rpc/get_event_availability')) return reply([{ ticket_type_id: 'type-1', available: 1 }]);
    if (p.endsWith('/rpc/next_order_number')) return reply(`KK-2026-${++seq}`);
    if (p.endsWith('/events')) {
      const event = { id: 'event-1', status: 'published', allow_cash: true, title: 'Offline test', start_date: '2026-10-01', price: 25, currency: 'EUR' };
      return reply(init.headers?.Accept ? event : [event]);
    }
    if (p.endsWith('/ticket_types')) return reply([{ id: 'type-1', event_id: 'event-1', price: 25 }]);
    if (p.endsWith('/orders') && init.method === 'POST') {
      const row = { id: `order-${orders.length + 1}`, ...JSON.parse(init.body) }; orders.push(row); return reply([row]);
    }
    if (p.endsWith('/orders') && init.method === 'PATCH') { patches++; return reply([]); }
    throw new Error(`Unmocked request: ${u.pathname}`);
  };
  return { orders, get patches() { return patches; } };
}
function checkout(method) {
  return new Request('https://worker.invalid/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: 'event-1', ticket_type_id: 'type-1', quantity: 1, customer_name: 'Offline', customer_email: 'offline@example.invalid', payment_method: method }) });
}
try {
  for (const path of ['workers/kk-ticketing-cloudflare.js', 'workers/kk-ticketing-worker.js']) {
    const worker = await load(path); const db = fixture();
    const response = await worker.fetch(checkout('free'), env);
    assert.equal(response.status, 200);
    assert.equal(db.orders[0].total_amount, 25);
    assert.equal(db.orders[0].payment_status, 'paid');
    results.push({ defect: 'Client-selected free marks EUR 25 order paid', path, reproduced: true });
  }
  const worker = await load('workers/kk-ticketing-cloudflare.js');
  const db = fixture();
  const payload = JSON.stringify({ id: 'evt_offline', type: 'checkout.session.completed', data: { object: { id: 'cs_offline', payment_intent: 'pi_offline', metadata: {}, payment_status: 'paid' } } });
  const ts = Math.floor(Date.now() / 1000);
  const key = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = Buffer.from(await webcrypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${payload}`))).toString('hex');
  const response = await worker.fetch(new Request('https://worker.invalid/webhook/stripe', { method: 'POST', headers: { 'stripe-signature': `t=${ts},v1=${sig}` }, body: payload }), env);
  assert.equal(response.status, 200); assert.equal(db.patches, 0);
  results.push({ defect: 'Valid completed session with PI-only metadata acknowledged without order update', reproduced: true });
  const race = fixture();
  const responses = await Promise.all([worker.fetch(checkout('bar'), env), worker.fetch(checkout('bar'), env)]);
  assert.deepEqual(responses.map(r => r.status), [200, 200]); assert.equal(race.orders.length, 2);
  results.push({ defect: 'Two checkout requests both accept same last available ticket in simulated interleaving', reproduced: true, limitation: 'Mock database; not a PostgreSQL load test' });
  console.log(JSON.stringify({ mode: 'offline; all fetch calls intercepted', checks: results }, null, 2));
} finally { globalThis.fetch = originalFetch; }
