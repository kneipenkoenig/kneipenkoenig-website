/**
 * E-Mail-Versand via Resend (https://resend.com)
 * Kostenlos: 100 Mails/Tag, 3000/Monat
 *
 * Setup:
 * 1. Account auf resend.com erstellen
 * 2. Domain verifizieren (kneipenkoenig.de) oder mit onboarding@resend.dev testen
 * 3. API Key generieren
 * 4. wrangler secret put RESEND_API_KEY
 */

const DE_DAYS = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
const DE_MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

function formatDate(isoDate) {
  const d = new Date(isoDate);
  return `${DE_DAYS[d.getDay()]}, ${d.getDate()}. ${DE_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function formatTime(isoDate) {
  const d = new Date(isoDate);
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function formatEuro(amount) {
  return parseFloat(amount).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}


export async function sendConfirmationEmail(env, { order, event }) {
  if (!env.RESEND_API_KEY) {
    console.log('RESEND_API_KEY nicht gesetzt – E-Mail übersprungen');
    return;
  }

  const fromEmail = env.EMAIL_FROM || 'tickets@kneipenkoenig.de';
  const paymentLabels = { stripe: 'Kreditkarte', paypal: 'PayPal', bar: 'Barzahlung vor Ort', free: 'Kostenlos' };

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0; padding:0; background:#0a0a1a; font-family:'Helvetica Neue',Arial,sans-serif; color:#ffffff;">
  <div style="max-width:560px; margin:0 auto; padding:40px 20px;">

    <!-- Header -->
    <div style="text-align:center; margin-bottom:32px;">
      <div style="font-size:24px; font-weight:800; letter-spacing:-0.5px;">
        <span style="color:#ffffff;">DER</span><span style="color:#38b6ff;">KNEIPENKÖNIG</span>
      </div>
    </div>

    <!-- Bestätigung -->
    <div style="background:rgba(52,211,153,0.1); border:1px solid rgba(52,211,153,0.3); border-radius:16px; padding:24px; text-align:center; margin-bottom:24px;">
      <div style="font-size:40px; margin-bottom:8px;">✓</div>
      <div style="font-size:22px; font-weight:700;">Buchung bestätigt!</div>
      <div style="color:rgba(255,255,255,0.6); margin-top:4px;">Bestellnummer: <strong style="color:#38b6ff;">${order.order_number}</strong></div>
    </div>

    <!-- Event-Details -->
    <div style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:16px; padding:24px; margin-bottom:24px;">
      <div style="font-size:18px; font-weight:700; margin-bottom:16px; padding-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.1);">${event.title}</div>

      <table style="width:100%; border-collapse:collapse;">
        <tr>
          <td style="padding:8px 0; color:rgba(255,255,255,0.5); font-size:14px;">Datum</td>
          <td style="padding:8px 0; text-align:right; font-weight:600; font-size:14px;">${formatDate(event.start_date)} · ${formatTime(event.start_date)} Uhr</td>
        </tr>
        <tr>
          <td style="padding:8px 0; color:rgba(255,255,255,0.5); font-size:14px;">Location</td>
          <td style="padding:8px 0; text-align:right; font-weight:600; font-size:14px;">${event.venue_name || '–'}${event.venue_address ? '<br><span style="font-weight:400;color:rgba(255,255,255,0.5);font-size:12px;">' + event.venue_address + '</span>' : ''}</td>
        </tr>
        ${order.team_name ? `<tr>
          <td style="padding:8px 0; color:rgba(255,255,255,0.5); font-size:14px;">Team</td>
          <td style="padding:8px 0; text-align:right; font-weight:600; font-size:14px; color:#38b6ff;">${order.team_name}</td>
        </tr>` : ''}
        <tr>
          <td style="padding:8px 0; color:rgba(255,255,255,0.5); font-size:14px;">Tickets</td>
          <td style="padding:8px 0; text-align:right; font-weight:600; font-size:14px;">${order.quantity}×</td>
        </tr>
        <tr>
          <td style="padding:8px 0; color:rgba(255,255,255,0.5); font-size:14px;">Betrag</td>
          <td style="padding:8px 0; text-align:right; font-weight:600; font-size:14px;">${formatEuro(order.total_amount)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0; color:rgba(255,255,255,0.5); font-size:14px;">Zahlung</td>
          <td style="padding:8px 0; text-align:right; font-weight:600; font-size:14px;">${paymentLabels[order.payment_method] || order.payment_method}</td>
        </tr>
      </table>
    </div>

    ${order.payment_method === 'bar' ? `
    <!-- Barzahlung Hinweis -->
    <div style="background:rgba(234,179,8,0.1); border:1px solid rgba(234,179,8,0.3); border-radius:12px; padding:16px; margin-bottom:24px; font-size:14px; color:rgba(255,255,255,0.7);">
      <strong style="color:#eab308;">💶 Barzahlung</strong><br>
      Bitte bezahle den Betrag vor Ort bei der Anmeldung.
    </div>` : ''}

    <!-- Bestätigungsseite Link -->
    <div style="text-align:center; margin-bottom:32px;">
      <a href="https://kneipenkoenig.de/buchung-bestaetigt.html?order=${order.order_number}"
         style="display:inline-block; background:#38b6ff; color:#000; padding:14px 32px; border-radius:10px; font-weight:700; font-size:15px; text-decoration:none;">
        Buchung anzeigen & QR-Code
      </a>
    </div>

    <!-- Footer -->
    <div style="text-align:center; color:rgba(255,255,255,0.3); font-size:12px; padding-top:24px; border-top:1px solid rgba(255,255,255,0.08);">
      <p>Der Kneipenkönig · Lettevents · Michael Schülke</p>
      <p>Nikolaus-Groß-Str. 27, 48653 Coesfeld</p>
      <p style="margin-top:8px;">
        <a href="https://kneipenkoenig.de" style="color:#38b6ff; text-decoration:none;">kneipenkoenig.de</a> ·
        <a href="https://www.instagram.com/derkneipenkoenig/" style="color:#38b6ff; text-decoration:none;">Instagram</a>
      </p>
    </div>

  </div>
</body>
</html>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Der Kneipenkönig <${fromEmail}>`,
        reply_to: 'info@kneipenkoenig.de',
        to: [order.customer_email],
        subject: `Buchung bestätigt: ${event.title} – ${order.order_number}`,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Resend error:', err);
    } else {
      console.log(`Confirmation email sent to ${order.customer_email}`);
    }
  } catch (err) {
    console.error('Email send failed:', err);
  }
}


export async function sendWaitlistNotification(env, { email, name, event }) {
  if (!env.RESEND_API_KEY) return;

  const fromEmail = env.EMAIL_FROM || 'tickets@kneipenkoenig.de';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0; padding:0; background:#0a0a1a; font-family:'Helvetica Neue',Arial,sans-serif; color:#ffffff;">
  <div style="max-width:560px; margin:0 auto; padding:40px 20px;">
    <div style="text-align:center; margin-bottom:32px;">
      <div style="font-size:24px; font-weight:800;">
        <span style="color:#ffffff;">DER</span><span style="color:#38b6ff;">KNEIPENKÖNIG</span>
      </div>
    </div>

    <div style="background:rgba(56,182,255,0.1); border:1px solid rgba(56,182,255,0.3); border-radius:16px; padding:24px; text-align:center; margin-bottom:24px;">
      <div style="font-size:40px; margin-bottom:8px;">🎉</div>
      <div style="font-size:20px; font-weight:700;">Platz frei geworden!</div>
      <div style="color:rgba(255,255,255,0.6); margin-top:8px; font-size:15px;">
        Hallo ${name}, für <strong>${event.title}</strong> ist wieder ein Platz verfügbar!
      </div>
    </div>

    <div style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:16px; padding:20px; margin-bottom:24px; text-align:center;">
      <div style="font-weight:600; margin-bottom:4px;">${event.title}</div>
      <div style="color:rgba(255,255,255,0.5); font-size:14px;">${formatDate(event.start_date)} · ${formatTime(event.start_date)} Uhr</div>
      ${event.venue_name ? `<div style="color:rgba(255,255,255,0.5); font-size:14px;">${event.venue_name}</div>` : ''}
    </div>

    <div style="text-align:center; margin-bottom:32px;">
      <a href="https://kneipenkoenig.de/ticketing.html"
         style="display:inline-block; background:#38b6ff; color:#000; padding:14px 32px; border-radius:10px; font-weight:700; font-size:15px; text-decoration:none;">
        Jetzt Ticket sichern →
      </a>
    </div>

    <div style="text-align:center; color:rgba(255,255,255,0.3); font-size:12px; padding-top:24px; border-top:1px solid rgba(255,255,255,0.08);">
      <p>Der Kneipenkönig · Lettevents</p>
      <p><a href="https://kneipenkoenig.de" style="color:#38b6ff; text-decoration:none;">kneipenkoenig.de</a></p>
    </div>
  </div>
</body>
</html>`;

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Der Kneipenkönig <${fromEmail}>`,
        reply_to: 'info@kneipenkoenig.de',
        to: [email],
        subject: `Platz frei: ${event.title} – Jetzt buchen!`,
        html,
      }),
    });
  } catch (err) {
    console.error('Waitlist notification failed:', err);
  }
}
