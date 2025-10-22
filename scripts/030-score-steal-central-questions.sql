-- ============================================================
-- Score Steal 게임을 중앙 문제 관리 시스템과 연동
-- ============================================================
-- score_steal_sessions의 current_question_id가 central_questions를 참조하도록 수정
-- ============================================================

-- 기존 외래키 제약조건 제거 (있다면)
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'score_steal_sessions_current_question_id_fkey'
    ) THEN
        ALTER TABLE score_steal_sessions 
        DROP CONSTRAINT score_steal_sessions_current_question_id_fkey;
    END IF;
END $$;

-- current_question_id가 central_questions를 참조하도록 외래키 추가
ALTER TABLE score_steal_sessions
ADD CONSTRAINT score_steal_sessions_current_question_id_fkey 
FOREIGN KEY (current_question_id) REFERENCES central_questions(id);

-- score_steal_attempts 테이블도 central_questions를 참조하도록 수정
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'score_steal_attempts_question_id_fkey'
    ) THEN
        ALTER TABLE score_steal_attempts 
        DROP CONSTRAINT score_steal_attempts_question_id_fkey;
    END IF;
END $$;

ALTER TABLE score_steal_attempts
ADD CONSTRAINT score_steal_attempts_question_id_fkey 
FOREIGN KEY (question_id) REFERENCES central_questions(id);

-- score_steal_protection 테이블도 central_questions를 참조하도록 수정
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'score_steal_protection_question_id_fkey'
    ) THEN
        ALTER TABLE score_steal_protection 
        DROP CONSTRAINT score_steal_protection_question_id_fkey;
    END IF;
END $$;

ALTER TABLE score_steal_protection
ADD CONSTRAINT score_steal_protection_question_id_fkey 
FOREIGN KEY (question_id) REFERENCES central_questions(id);

-- 점수뺏기 실시간 답안 제출 함수 (중앙 문제 관리 시스템 사용)
CREATE OR REPLACE FUNCTION submit_score_steal_answer_central(
    p_session_id UUID,
    p_team_id UUID,
    p_answer TEXT,
    p_broadcast_time TIMESTAMP WITH TIME ZONE
)
RETURNS TABLE (
    attempt_id UUID,
    is_correct BOOLEAN,
    is_winner BOOLEAN,
    response_time_ms INTEGER,
    success BOOLEAN,
    message TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_attempt_id UUID;
    v_session_record RECORD;
    v_question_record RECORD;
    v_is_correct BOOLEAN := FALSE;
    v_response_time_ms INTEGER;
    v_is_winner BOOLEAN := FALSE;
    v_existing_winner BOOLEAN := FALSE;
BEGIN
    -- 세션 정보 확인
    SELECT * INTO v_session_record
    FROM score_steal_sessions
    WHERE id = p_session_id 
    AND status = 'active' 
    AND phase = 'question_active';
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT 
            NULL::UUID, FALSE, FALSE, 0, FALSE, 
            'Session not found or not in question phase';
        RETURN;
    END IF;
    
    -- 중앙 문제에서 정답 가져오기
    SELECT correct_answer, points INTO v_question_record
    FROM central_questions
    WHERE id = v_session_record.current_question_id;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT 
            NULL::UUID, FALSE, FALSE, 0, FALSE, 
            'Question not found';
        RETURN;
    END IF;
    
    -- 응답 시간 계산
    v_response_time_ms := EXTRACT(EPOCH FROM (NOW() - p_broadcast_time)) * 1000;
    
    -- 정답 확인 (대소문자 무시, 공백 제거)
    v_is_correct := LOWER(TRIM(p_answer)) = LOWER(TRIM(v_question_record.correct_answer));
    
    -- 이미 승자가 있는지 확인
    SELECT EXISTS(
        SELECT 1 FROM score_steal_attempts
        WHERE session_id = p_session_id 
        AND is_winner = TRUE
    ) INTO v_existing_winner;
    
    -- 정답이고 아직 승자가 없다면 승자로 설정
    IF v_is_correct AND NOT v_existing_winner THEN
        v_is_winner := TRUE;
    END IF;
    
    -- 답안 제출 기록
    INSERT INTO score_steal_attempts (
        session_id,
        team_id,
        question_id,
        answer,
        is_correct,
        is_winner,
        response_time_ms,
        submitted_at
    ) VALUES (
        p_session_id,
        p_team_id,
        v_session_record.current_question_id,
        p_answer,
        v_is_correct,
        v_is_winner,
        v_response_time_ms,
        NOW()
    )
    RETURNING id INTO v_attempt_id;
    
    -- 승자가 결정되면 세션 상태 업데이트
    IF v_is_winner THEN
        UPDATE score_steal_sessions
        SET phase = 'waiting_for_target',
            winner_team_id = p_team_id
        WHERE id = p_session_id;
    END IF;
    
    RETURN QUERY SELECT 
        v_attempt_id, 
        v_is_correct, 
        v_is_winner, 
        v_response_time_ms, 
        TRUE,
        CASE 
            WHEN v_is_winner THEN 'Correct! You are the winner!'
            WHEN v_is_correct THEN 'Correct answer, but someone was faster'
            ELSE 'Incorrect answer'
        END;
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT 
            NULL::UUID, FALSE, FALSE, 0, FALSE, SQLERRM;
END;
$$;

-- 점수뺏기 타겟 선택 및 실행 함수 (중앙 문제 관리 시스템 사용)
CREATE OR REPLACE FUNCTION execute_score_steal_central(
    p_session_id UUID,
    p_target_team_id UUID
)
RETURNS TABLE (
    points_stolen INTEGER,
    winner_new_score INTEGER,
    target_new_score INTEGER,
    success BOOLEAN,
    message TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_session_record RECORD;
    v_question_points INTEGER;
    v_winner_team_id UUID;
    v_winner_score INTEGER;
    v_target_score INTEGER;
BEGIN
    -- 세션 정보 확인
    SELECT * INTO v_session_record
    FROM score_steal_sessions
    WHERE id = p_session_id 
    AND status = 'active' 
    AND phase = 'waiting_for_target';
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT 0, 0, 0, FALSE, 'Session not found or not in target selection phase';
        RETURN;
    END IF;
    
    -- 중앙 문제에서 배점 가져오기
    SELECT points INTO v_question_points
    FROM central_questions
    WHERE id = v_session_record.current_question_id;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT 0, 0, 0, FALSE, 'Question not found';
        RETURN;
    END IF;
    
    v_winner_team_id := v_session_record.winner_team_id;
    
    -- 점수 이동 (원자적 트랜잭션)
    -- 타겟 팀에서 점수 차감
    UPDATE teams
    SET score = GREATEST(0, score - v_question_points)
    WHERE id = p_target_team_id
    RETURNING score INTO v_target_score;
    
    -- 승자 팀에 점수 추가
    UPDATE teams
    SET score = score + v_question_points
    WHERE id = v_winner_team_id
    RETURNING score INTO v_winner_score;
    
    -- 세션 완료 처리
    UPDATE score_steal_sessions
    SET status = 'finished',
        phase = 'completed',
        ended_at = NOW()
    WHERE id = p_session_id;
    
    RETURN QUERY SELECT 
        v_question_points,
        v_winner_score,
        v_target_score,
        TRUE,
        'Score steal executed successfully';
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT 0, 0, 0, FALSE, SQLERRM;
END;
$$;

COMMENT ON FUNCTION submit_score_steal_answer_central IS '점수뺏기 답안 제출 (중앙 문제 관리 시스템 사용)';
COMMENT ON FUNCTION execute_score_steal_central IS '점수뺏기 실행 (중앙 문제 관리 시스템 사용)';