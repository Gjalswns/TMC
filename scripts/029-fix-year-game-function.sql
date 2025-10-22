-- Fix Year Game session start function
-- This ensures the function exists with the correct signature

DROP FUNCTION IF EXISTS start_year_game_session(UUID, INTEGER, INTEGER, INTEGER[]);

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
        target_range_start,
        target_range_end,
        status, 
        started_at
    ) VALUES (
        p_game_id, 
        p_round_number, 
        p_target_numbers, 
        p_time_limit_seconds,
        1,
        100,
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
            score,
            numbers_found_count,
            completion_percentage
        ) VALUES (
            v_session_id, 
            v_team_record.id, 
            ARRAY[]::INTEGER[], 
            0, 
            0,
            0,
            0.00
        );
    END LOOP;

    RETURN QUERY SELECT v_session_id, TRUE, 'Year Game session started successfully'::TEXT;
END;
$$;
