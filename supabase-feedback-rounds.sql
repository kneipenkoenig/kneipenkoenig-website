-- Runden-Bewertungen zur Feedback-Tabelle hinzufügen
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS round_1 SMALLINT CHECK (round_1 IS NULL OR (round_1 >= 1 AND round_1 <= 10));
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS round_2 SMALLINT CHECK (round_2 IS NULL OR (round_2 >= 1 AND round_2 <= 10));
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS round_3 SMALLINT CHECK (round_3 IS NULL OR (round_3 >= 1 AND round_3 <= 10));
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS round_4 SMALLINT CHECK (round_4 IS NULL OR (round_4 >= 1 AND round_4 <= 10));
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS round_5 SMALLINT CHECK (round_5 IS NULL OR (round_5 >= 1 AND round_5 <= 10));
