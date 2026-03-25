-- ============================================================
-- Kneipenkönig Ticketing System – Datenbank-Schema
-- Supabase (PostgreSQL)
-- Ausführen: Supabase Dashboard → SQL Editor → New Query → Einfügen → Run
-- ============================================================

-- 1. EVENTS
CREATE TABLE IF NOT EXISTS events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  description     TEXT,
  venue_name      TEXT,
  venue_address   TEXT,
  location_id     INT,
  start_date      TIMESTAMPTZ NOT NULL,
  end_date        TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'published', 'cancelled')),
  image_url       TEXT,
  checkout_fields JSONB DEFAULT '[]'::jsonb,
  allow_cash      BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE events IS 'Quiz-Events mit Datum, Location und Ticket-Einstellungen';
COMMENT ON COLUMN events.status IS 'draft = nicht sichtbar, published = buchbar, cancelled = abgesagt';
COMMENT ON COLUMN events.checkout_fields IS 'Zusätzliche Formularfelder als JSON-Array, z.B. [{"label":"Allergien","type":"text","required":false}]';
COMMENT ON COLUMN events.allow_cash IS 'Ob Barzahlung vor Ort als Zahlmethode erlaubt ist';

-- Auto-Update für updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_start_date ON events(start_date);
CREATE INDEX idx_events_location ON events(location_id);


-- 2. TICKET_TYPES
CREATE TABLE IF NOT EXISTS ticket_types (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  price           DECIMAL(10,2) NOT NULL DEFAULT 0,
  max_quantity    INT,
  max_players     INT NOT NULL DEFAULT 1,
  sort_order      INT NOT NULL DEFAULT 0
);

COMMENT ON TABLE ticket_types IS 'Ticket-Kategorien pro Event (z.B. Team-Ticket, Einzelticket)';
COMMENT ON COLUMN ticket_types.max_players IS '1 = Einzelticket, 6 = Team bis 6 Spieler';
COMMENT ON COLUMN ticket_types.max_quantity IS 'Max. verkaufbare Tickets dieses Typs, NULL = unbegrenzt';

CREATE INDEX idx_ticket_types_event ON ticket_types(event_id);


-- 3. ORDERS
CREATE TABLE IF NOT EXISTS orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  ticket_type_id  UUID REFERENCES ticket_types(id) ON DELETE SET NULL,
  order_number    TEXT NOT NULL UNIQUE,
  customer_name   TEXT NOT NULL,
  customer_email  TEXT NOT NULL,
  customer_phone  TEXT,
  team_name       TEXT,
  player_names    JSONB DEFAULT '[]'::jsonb,
  quantity        INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  total_amount    DECIMAL(10,2) NOT NULL DEFAULT 0,
  discount_code   TEXT,
  discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  payment_method  TEXT NOT NULL DEFAULT 'free'
                    CHECK (payment_method IN ('stripe', 'paypal', 'free', 'bar')),
  payment_status  TEXT NOT NULL DEFAULT 'pending'
                    CHECK (payment_status IN ('pending', 'paid', 'refunded', 'cancelled')),
  payment_id      TEXT,
  checkout_data   JSONB DEFAULT '{}'::jsonb,
  checked_in      BOOLEAN NOT NULL DEFAULT false,
  checked_in_at   TIMESTAMPTZ,
  qr_code         TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_uuid()::text::bytea, 'hex'),
  email_sent      BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE orders IS 'Bestellungen / gebuchte Tickets';
COMMENT ON COLUMN orders.order_number IS 'Lesbares Format: KK-2026-0001';
COMMENT ON COLUMN orders.payment_id IS 'Stripe Payment Intent ID oder PayPal Transaction ID';
COMMENT ON COLUMN orders.player_names IS 'Namen der Spieler bei Team-Tickets, z.B. ["Max","Lisa","Tom"]';
COMMENT ON COLUMN orders.qr_code IS 'Eindeutiger Token für Check-in QR-Code';
COMMENT ON COLUMN orders.discount_code IS 'Genutzter Rabattcode';
COMMENT ON COLUMN orders.discount_amount IS 'Rabattbetrag in EUR';

CREATE INDEX idx_orders_event ON orders(event_id);
CREATE INDEX idx_orders_status ON orders(payment_status);
CREATE INDEX idx_orders_email ON orders(customer_email);
CREATE INDEX idx_orders_number ON orders(order_number);
CREATE INDEX idx_orders_qr ON orders(qr_code);


-- 4. DISCOUNT_CODES
CREATE TABLE IF NOT EXISTS discount_codes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT NOT NULL UNIQUE,
  type            TEXT NOT NULL CHECK (type IN ('percent', 'fixed')),
  value           DECIMAL(10,2) NOT NULL CHECK (value > 0),
  max_uses        INT,
  used_count      INT NOT NULL DEFAULT 0,
  valid_from      TIMESTAMPTZ,
  valid_until     TIMESTAMPTZ,
  event_id        UUID REFERENCES events(id) ON DELETE CASCADE,
  active          BOOLEAN NOT NULL DEFAULT true
);

COMMENT ON TABLE discount_codes IS 'Rabattcodes – event_id NULL = gilt für alle Events';
COMMENT ON COLUMN discount_codes.type IS 'percent = Prozent-Rabatt, fixed = fester Euro-Betrag';

CREATE INDEX idx_discount_codes_code ON discount_codes(code);
CREATE INDEX idx_discount_codes_event ON discount_codes(event_id);


-- 5. WAITLIST
CREATE TABLE IF NOT EXISTS waitlist (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  team_name       TEXT,
  notified        BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE waitlist IS 'Warteliste für ausverkaufte Events';

CREATE INDEX idx_waitlist_event ON waitlist(event_id);


-- ============================================================
-- Hilfsfunktion: Verfügbarkeit pro Ticket-Typ
-- ============================================================
CREATE OR REPLACE FUNCTION get_event_availability(p_event_id UUID)
RETURNS TABLE (
  ticket_type_id UUID,
  ticket_type_name TEXT,
  ticket_description TEXT,
  price DECIMAL,
  max_players INT,
  max_quantity INT,
  sold INT,
  available INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    tt.id,
    tt.name,
    tt.description,
    tt.price,
    tt.max_players,
    tt.max_quantity,
    COALESCE(SUM(o.quantity) FILTER (WHERE o.payment_status IN ('pending','paid')), 0)::INT AS sold,
    CASE
      WHEN tt.max_quantity IS NULL THEN 999
      ELSE GREATEST(0, tt.max_quantity - COALESCE(SUM(o.quantity) FILTER (WHERE o.payment_status IN ('pending','paid')), 0))::INT
    END AS available
  FROM ticket_types tt
  LEFT JOIN orders o ON o.ticket_type_id = tt.id
  WHERE tt.event_id = p_event_id
  GROUP BY tt.id, tt.name, tt.description, tt.price, tt.max_players, tt.max_quantity
  ORDER BY tt.sort_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_event_availability IS 'Gibt Verfügbarkeit aller Ticket-Typen eines Events zurück';


-- ============================================================
-- Hilfsfunktion: Nächste Order-Nummer generieren
-- ============================================================
CREATE OR REPLACE FUNCTION next_order_number()
RETURNS TEXT AS $$
DECLARE
  v_year TEXT;
  v_seq INT;
BEGIN
  v_year := TO_CHAR(now(), 'YYYY');
  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(order_number, '-', 3) AS INT)
  ), 0) + 1
  INTO v_seq
  FROM orders
  WHERE order_number LIKE 'KK-' || v_year || '-%';

  RETURN 'KK-' || v_year || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION next_order_number IS 'Generiert KK-YYYY-NNNN Format für Bestellnummern';


-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

-- Events: öffentlich lesbar (published), alles andere nur Service-Key
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY events_public_read ON events
  FOR SELECT USING (status = 'published');

CREATE POLICY events_service_all ON events
  FOR ALL USING (auth.role() = 'service_role');

-- Ticket Types: öffentlich lesbar (wenn Event published)
ALTER TABLE ticket_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY ticket_types_public_read ON ticket_types
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM events WHERE events.id = ticket_types.event_id AND events.status = 'published')
  );

CREATE POLICY ticket_types_service_all ON ticket_types
  FOR ALL USING (auth.role() = 'service_role');

-- Orders: nur Service-Key
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY orders_service_all ON orders
  FOR ALL USING (auth.role() = 'service_role');

-- Discount Codes: nur Service-Key
ALTER TABLE discount_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY discount_codes_service_all ON discount_codes
  FOR ALL USING (auth.role() = 'service_role');

-- Waitlist: Insert öffentlich, Rest nur Service-Key
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY waitlist_public_insert ON waitlist
  FOR INSERT WITH CHECK (true);

CREATE POLICY waitlist_service_all ON waitlist
  FOR ALL USING (auth.role() = 'service_role');
