-- ============================================================
-- Year Game Functions - Quick Fix
-- ============================================================
-- This adds the missing start_year_game_session function
-- ============================================================

-- Year Game 세션 시작 함수
CREATE OR REPLACE FUNCTION start_year_game_session(
    p_game_id UUID,
    p_round_number INTEGER DEFAULT 1,
    p_time_limit_seconds INTEGER DEFAULT 600,
    p_target_numbers INTEGER[] DEFAULT ARRAY[3, 7, 12, 25]
)
RETURNS TABLE (
    session_id UUID,
    success BOOLEAN,
    message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session_id UUID;
    v_team_record RECORD;
BEGIN
    -- 기존 활성 세션 종료
    UPDATE year_game_sessions 
    SET status = 'finished', ended_at = NOW()
    WHERE game_id = p_game_id AND status = 'active';

    -- 새 세션 생성
    INSERT INTO year_game_sessions (
        game_id, 
        round_number, 
        target_numbers, 
        time_limit_seconds,
        status, 
        started_at
    ) VALUES (
        p_game_id, 
        p_round_number, 
        p_target_numbers, 
        p_time_limit_seconds,
        'active', 
        NOW()
    ) RETURNING id INTO v_session_id;

    -- 모든 팀에 대해 결과 테이블 초기화
    FOR v_team_record IN 
        SELECT id, team_name FROM teams WHERE game_id = p_game_id
    LOOP
        INSERT INTO year_game_results (
            session_id, 
            team_id, 
            numbers_found, 
            total_found, 
            score
        ) VALUES (
            v_session_id, 
            v_team_record.id, 
            ARRAY[]::INTEGER[], 
            0, 
            0
        );
    END LOOP;

    RETURN QUERY SELECT v_session_id, TRUE, 'Year Game session started successfully';

EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT NULL::UUID, FALSE, SQLERRM;
END;
$$;

-- Year Game 세션 종료 함수
CREATE OR REPLACE FUNCTION finish_year_game_session(p_session_id UUID)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_game_id UUID;
    v_team_record RECORD;
BEGIN
    -- 세션 정보 확인
    SELECT game_id INTO v_game_id
    FROM year_game_sessions 
    WHERE id = p_session_id AND status = 'active';

    IF v_game_id IS NULL THEN
        RETURN QUERY SELECT FALSE, 'Session not found or already finished';
        RETURN;
    END IF;

    -- 세션 종료
    UPDATE year_game_sessions 
    SET status = 'finished', ended_at = NOW()
    WHERE id = p_session_id;

    -- 각 팀의 점수를 게임 점수에 합산
    FOR v_team_record IN
        SELECT ygr.team_id, ygr.score
        FROM year_game_results ygr
        WHERE ygr.session_id = p_session_id
    LOOP
        UPDATE teams
        SET score = score + v_team_record.score,
            updated_at = NOW()
        WHERE id = v_team_record.team_id;
    END LOOP;

    RETURN QUERY SELECT TRUE, 'Session finished and scores updated';

EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT FALSE, SQLERRM;
END;
$$;

-- ============================================================
-- 완료
-- ============================================================

COMMENT ON FUNCTION start_year_game_session(UUID, INTEGER, INTEGER, INTEGER[]) IS 'Year Game 세션 시작';
COMMENT ON FUNCTION finish_year_game_session(UUID) IS 'Year Game 세션 종료 및 점수 합산';
