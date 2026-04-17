-- RPC-Funktion für Live-Statistiken (umgeht CORS-Problem mit content-range)
CREATE OR REPLACE FUNCTION public.get_website_stats()
RETURNS JSON AS $$
DECLARE
  v_teams INT;
  v_quizzes INT;
  v_teilnahmen INT;
BEGIN
  SELECT COUNT(*) INTO v_teams FROM teams;
  SELECT COUNT(*) INTO v_quizzes FROM quizes;
  SELECT COUNT(*) INTO v_teilnahmen FROM quiz_teams;
  RETURN json_build_object(
    'teams', v_teams,
    'quizzes', v_quizzes,
    'teilnahmen', v_teilnahmen
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
