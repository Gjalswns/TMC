-- ============================================================
-- Quick Fix: Add Year Game Functions
-- ============================================================
-- Run this in Supabase SQL Editor to fix the missing functions
-- ============================================================

-- 기존 함수 삭제 (반환 타입 변경을 위해)
DROP FUNCTION IF EXISTS start_year_game_session(UUID, INTEGER, INTEGER, INTEGER[]);
DROP FUNCTION IF EXISTS submit_year_game_team_attempt(UUID, UUID, UUID, TEXT, INTEGER);
DROP FUNCTION IF EXISTS finish_year_game_session(UUID);

-- Year Game 세션 시작 함수
CREATE OR REPLACE FUNCTION start_year_game_session(
    p_game_id UUID,
    p_round_number INTEGER DEFAULT 1,
    p_time_limit_seconds INTEGER DEFAULT 600,
    p_target_numbers INTEGER[] DEFAULT ARRAY[3, 7, 12, 25]
)
RETURNS JSON
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

    RETURN json_build_object(
        'session_id', v_session_id,
        'success', TRUE,
        'message', 'Year Game session started successfully'
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'session_id', NULL,
            'success', FALSE,
            'message', SQLERRM
        );
END;
$$;

-- Year Game 시도 제출 함수 (팀 단위)
CREATE OR REPLACE FUNCTION submit_year_game_team_attempt(
    p_session_id UUID,
    p_team_id UUID,
    p_participant_id UUID,
    p_expression TEXT,
    p_target_number INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_attempt_id UUID;
    v_is_valid BOOLEAN := FALSE;
    v_is_correct BOOLEAN := FALSE;
    v_is_duplicate BOOLEAN := FALSE;
    v_is_new_number BOOLEAN := FALSE;
    v_session_record RECORD;
    v_current_numbers INTEGER[];
    v_new_score INTEGER;
    v_new_total INTEGER;
BEGIN
    -- 세션 정보 확인
    SELECT * INTO v_session_record
    FROM year_game_sessions 
    WHERE id = p_session_id AND status = 'active';

    IF NOT FOUND THEN
        RETURN json_build_object(
            'attempt_id', NULL,
            'is_valid', FALSE,
            'is_correct', FALSE,
            'is_duplicate', FALSE,
            'is_new_number', FALSE,
            'team_score', 0,
            'team_total_found', 0,
            'success', FALSE,
            'message', 'Session not found or not active'
        );
    END IF;

    -- 시간 제한 확인
    IF NOW() > v_session_record.started_at + (v_session_record.time_limit_seconds || ' seconds')::INTERVAL THEN
        RETURN json_build_object(
            'attempt_id', NULL,
            'is_valid', FALSE,
            'is_correct', FALSE,
            'is_duplicate', FALSE,
            'is_new_number', FALSE,
            'team_score', 0,
            'team_total_found', 0,
            'success', FALSE,
            'message', 'Time limit exceeded'
        );
    END IF;

    -- 숫자 범위 확인 (1~100)
    IF p_target_number < 1 OR p_target_number > 100 THEN
        RETURN json_build_object(
            'attempt_id', NULL,
            'is_valid', FALSE,
            'is_correct', FALSE,
            'is_duplicate', FALSE,
            'is_new_number', FALSE,
            'team_score', 0,
            'team_total_found', 0,
            'success', FALSE,
            'message', 'Target number must be between 1 and 100'
        );
    END IF;

    -- 표현식 유효성 검사 (간단한 검사)
    v_is_valid := LENGTH(p_expression) > 0 AND p_expression ~ '^[0-9+\-*/^()!pPcC\s]+$';
    
    -- 정답 여부 확인 (실제로는 더 정교한 수식 계산 필요)
    v_is_correct := v_is_valid; -- 임시로 유효하면 정답으로 처리

    -- 현재 팀이 찾은 숫자들 확인
    SELECT numbers_found INTO v_current_numbers
    FROM year_game_results 
    WHERE session_id = p_session_id AND team_id = p_team_id;

    -- 중복 확인
    v_is_duplicate := p_target_number = ANY(v_current_numbers);
    v_is_new_number := v_is_correct AND NOT v_is_duplicate;

    -- 시도 기록 저장
    INSERT INTO year_game_attempts (
        session_id, 
        team_id, 
        participant_id, 
        expression, 
        target_number, 
        is_valid, 
        is_correct, 
        is_duplicate
    ) VALUES (
        p_session_id, 
        p_team_id, 
        p_participant_id, 
        p_expression, 
        p_target_number, 
        v_is_valid, 
        v_is_correct, 
        v_is_duplicate
    ) RETURNING id INTO v_attempt_id;

    -- 새로운 정답인 경우 팀 결과 업데이트
    IF v_is_new_number THEN
        UPDATE year_game_results 
        SET 
            numbers_found = array_append(numbers_found, p_target_number),
            total_found = total_found + 1,
            score = score + p_target_number,
            updated_at = NOW()
        WHERE session_id = p_session_id AND team_id = p_team_id;
    END IF;

    -- 업데이트된 팀 정보 조회
    SELECT score, total_found INTO v_new_score, v_new_total
    FROM year_game_results 
    WHERE session_id = p_session_id AND team_id = p_team_id;

    RETURN json_build_object(
        'attempt_id', v_attempt_id,
        'is_valid', v_is_valid,
        'is_correct', v_is_correct,
        'is_duplicate', v_is_duplicate,
        'is_new_number', v_is_new_number,
        'team_score', COALESCE(v_new_score, 0),
        'team_total_found', COALESCE(v_new_total, 0),
        'success', TRUE,
        'message', CASE 
            WHEN v_is_new_number THEN 'New number found!'
            WHEN v_is_duplicate THEN 'Number already found by your team'
            WHEN NOT v_is_valid THEN 'Invalid expression'
            WHEN NOT v_is_correct THEN 'Incorrect calculation'
            ELSE 'Attempt recorded'
        END
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'attempt_id', NULL,
            'is_valid', FALSE,
            'is_correct', FALSE,
            'is_duplicate', FALSE,
            'is_new_number', FALSE,
            'team_score', 0,
            'team_total_found', 0,
            'success', FALSE,
            'message', SQLERRM
        );
END;
$$;

-- Year Game 세션 종료 함수
CREATE OR REPLACE FUNCTION finish_year_game_session(p_session_id UUID)
RETURNS JSON
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
        RETURN json_build_object(
            'success', FALSE,
            'message', 'Session not found or already finished'
        );
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

    RETURN json_build_object(
        'success', TRUE,
        'message', 'Session finished and scores updated'
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', FALSE,
            'message', SQLERRM
        );
END;
$$;

-- Verify the functions were created
SELECT 
    routine_name,
    routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN ('start_year_game_session', 'submit_year_game_team_attempt', 'finish_year_game_session');
