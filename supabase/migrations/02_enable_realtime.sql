-- ============================================================
-- TMC Game Platform - Realtime Configuration
-- ============================================================
-- Supabase Realtime 활성화
-- ============================================================

-- Realtime Publication에 테이블 추가
ALTER PUBLICATION supabase_realtime ADD TABLE games;
ALTER PUBLICATION supabase_realtime ADD TABLE teams;
ALTER PUBLICATION supabase_realtime ADD TABLE participants;
ALTER PUBLICATION supabase_realtime ADD TABLE preregistered_players;
ALTER PUBLICATION supabase_realtime ADD TABLE year_game_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE year_game_attempts;
ALTER PUBLICATION supabase_realtime ADD TABLE year_game_results;
ALTER PUBLICATION supabase_realtime ADD TABLE score_steal_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE score_steal_attempts;
ALTER PUBLICATION supabase_realtime ADD TABLE relay_quiz_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE relay_quiz_attempts;
ALTER PUBLICATION supabase_realtime ADD TABLE relay_quiz_team_progress;

-- ============================================================
-- 완료
-- ============================================================

COMMENT ON PUBLICATION supabase_realtime IS 'Realtime 구독 활성화';
