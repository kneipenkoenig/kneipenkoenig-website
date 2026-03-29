-- Stimmen für die Frage des Tages
CREATE TABLE IF NOT EXISTS quiz_daily_votes (
  vote_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  day_index INT NOT NULL,
  answer SMALLINT NOT NULL CHECK (answer >= 0 AND answer <= 3),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qdv_day ON quiz_daily_votes(day_index);

ALTER TABLE quiz_daily_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon kann abstimmen"
  ON quiz_daily_votes FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "Anon kann Ergebnisse lesen"
  ON quiz_daily_votes FOR SELECT TO anon
  USING (true);
