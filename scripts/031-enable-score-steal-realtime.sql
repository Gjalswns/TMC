-- ============================================================
-- Score Steal 게임 Realtime 활성화
-- ============================================================
-- 문제: score_steal_sessions 테이블에 Realtime이 활성화되지 않아
-- 문제 공개 시 사용자 화면에 실시간 반영이 안 됨
-- ============================================================

-- Score Steal 세션 테이블에 Realtime 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE score_steal_sessions;

-- Score Steal 시도 테이블에 Realtime 활성화 (이미 있을 수 있지만 안전하게 추가)
DO $$
BEGIN
    -- score_steal_attempts 테이블 Realtime 활성화
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE score_steal_attempts;
    EXCEPTION
        WHEN duplicate_object THEN
            -- 이미 추가되어 있으면 무시
            NULL;
    END;
END $$;

COMMENT ON TABLE score_steal_sessions IS 'Score Steal 게임 세션 (Realtime 활성화됨)';
COMMENT ON TABLE score_steal_attempts IS 'Score Steal 시도 기록 (Realtime 활성화됨)';
