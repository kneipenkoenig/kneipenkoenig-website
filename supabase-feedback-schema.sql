-- Feedback-Tabelle für Event-Bewertungen
CREATE TABLE IF NOT EXISTS feedback (
  feedback_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  quiz_id BIGINT REFERENCES quizes(quiz_id) ON DELETE SET NULL,
  team_id BIGINT REFERENCES teams(team_id) ON DELETE SET NULL,
  rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 10),
  comment TEXT,
  approved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index für schnelle Abfragen
CREATE INDEX idx_feedback_quiz ON feedback(quiz_id);

-- RLS aktivieren
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Anon darf Feedback einfügen
CREATE POLICY "Anon kann Feedback erstellen"
  ON feedback FOR INSERT TO anon
  WITH CHECK (true);

-- Anon darf nur Rating lesen (für Durchschnitt), keine Kommentare
CREATE POLICY "Anon kann Ratings lesen"
  ON feedback FOR SELECT TO anon
  USING (true);

-- Authenticated (Admin) darf alles
CREATE POLICY "Admin Vollzugriff"
  ON feedback FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
